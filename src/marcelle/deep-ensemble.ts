import { tensor2d, train, Tensor1D, Tensor2D, TensorLike, tensor, tidy, keep } from '@tensorflow/tfjs-core';
import {
  loadLayersModel,
  sequential,
  layers as tfLayers,
  Sequential,
} from '@tensorflow/tfjs-layers';
import { Stream, logger, ClassifierResults, TFJSModelOptions, TFJSModel, Dataset, TrainingStatus } from '@marcellejs/core';

interface TrainingData {
  training_x: Tensor2D;
  training_y: Tensor2D;
  validation_x: Tensor2D;
  validation_y: Tensor2D;
}

function arrayArgMax(softMaxes) {
  if (softMaxes.length <= 0) return 0;
  let ind = 0;
  let mMax = softMaxes[0];
  for (let i = 1; i < softMaxes.length; i += 1) {
    if (mMax < softMaxes[i]) {
      mMax = softMaxes[i];
      ind = i;
    }
  }
  return ind;
}

function shuffleArray<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const temp = b[i];
    b[i] = b[j];
    b[j] = temp;
  }
  return b;
}

async function dataSplit(
  dataset: Dataset,
  trainProportion: number,
  forceLabels: string[] = null,
): Promise<TrainingData> {
  const allInstances = await dataset.getAllInstances(['id', 'features', 'label']);

  let data: TrainingData;
  tidy(() => {
    const labels = forceLabels || dataset.$labels.value;
    const nClasses = labels.length;
    data = {
      training_x: tensor2d([], [0, 1]),
      training_y: tensor2d([], [0, nClasses]),
      validation_x: tensor2d([], [0, 1]),
      validation_y: tensor2d([], [0, nClasses]),
    };
    for (const label of labels) {
      if (!Object.keys(dataset.$classes.value).includes(label)) continue;
      const instances = dataset.$classes.value[label];
      const numInstances = instances.length;
      const shuffledIds = shuffleArray(instances);
      const thresh = Math.floor(trainProportion * numInstances);
      const trainingIds = shuffledIds.slice(0, thresh);
      const validationIds = shuffledIds.slice(thresh, numInstances);
      const y = Array(nClasses).fill(0);
      y[labels.indexOf(label)] = 1;
      for (const id of trainingIds) {
        const { features } = allInstances.find((x) => x.id === id) as { features: number[][] };
        if (data.training_x.shape[1] === 0) {
          data.training_x.shape[1] = features[0].length;
        }
        data.training_x = data.training_x.concat(tensor2d(features));
        data.training_y = data.training_y.concat(tensor2d([y]));
      }
      for (const id of validationIds) {
        const { features } = allInstances.find((x) => x.id === id) as { features: number[][] };
        if (data.validation_x.shape[1] === 0) {
          data.validation_x.shape[1] = features[0].length;
        }
        data.validation_x = data.validation_x.concat(tensor2d(features));
        data.validation_y = data.validation_y.concat(tensor2d([y]));
      }
    }
    keep(data.training_x);
    keep(data.training_y);
    keep(data.validation_x);
    keep(data.validation_y);
  });
  return data;
}

export interface MLPOptions extends TFJSModelOptions {
  numModels: number;
  layers: number[];
  epochs: number;
  batchSize: number;
}

export class DeepEnsemble extends TFJSModel<TensorLike, ClassifierResults> {
  title = 'DeepEnsemble';

  models: Sequential[];

  parameters: {
    numModels: Stream<number>;
    layers: Stream<number[]>;
    epochs: Stream<number>;
    batchSize: Stream<number>;
  };

  constructor({
    numModels = 5,
    layers = [64, 32],
    epochs = 20,
    batchSize = 8,
    ...rest
  }: Partial<MLPOptions> = {}) {
    super(rest);
    this.parameters = {
      numModels: new Stream(numModels, true),
      layers: new Stream(layers, true),
      epochs: new Stream(epochs, true),
      batchSize: new Stream(batchSize, true),
    };
  }

  train(dataset: Dataset, labels?: string[]): void {
    this.labels = labels;
    if (this.labels.length < 2) {
      this.$training.set({ status: 'error' });
      throw new Error('Cannot train a MLP with less than 2 classes');
    }
    this.$training.set({ status: 'start', epochs: this.parameters.epochs.value });
    setTimeout(async () => {
      if (dataset.$count.value>1) {
        const data = await dataSplit(dataset, 0.75, this.labels);
        this.buildModel(data.training_x.shape[1], this.labels.length);
        this.fit(data);
      } else {
        this.buildModel(1024, this.labels.length);
      }
    }, 100);
  }

  async predict(x: TensorLike): Promise<ClassifierResults & { certainty: number }> {
    if (!this.models) return { label: undefined, confidences: {}, certainty: 0 };
    return tidy(() => {
      const nModels = this.parameters.numModels.value;
      const softmaxArray = this.models
        .map(model => model.predict(tensor(x)) as Tensor2D)
        .map(x => x.arraySync()[0]);
      const softMaxes = new Array(softmaxArray[0].length).fill(0);
      for (let i = 0; i < nModels; i += 1) {
        for (let j = 0; j < softmaxArray[0].length; j += 1) {
          softMaxes[j] += softmaxArray[i][j] / nModels;
        }
      }
      const certainty = this.variationRatio(softmaxArray);
      const yPred = arrayArgMax(softMaxes);
      const label = this.labels[yPred];
      const confidences = softMaxes.reduce((c, x, i) => ({ ...c, [this.labels[i]]: x }), {});
      return { label, confidences, certainty };
    });
  }

  variationRatio(softMaxesArray: number[][]) {
    const nModels = this.parameters.numModels.value;
    const counters = new Array(softMaxesArray[0].length).fill(0);
    for (let i = 0; i < nModels; i += 1) {
      let maxIndex = 0;
      let maxValue = -1;
      for (let j = 0; j < softMaxesArray[0].length; j += 1) {
        if (maxValue < softMaxesArray[i][j]) {
          maxValue = softMaxesArray[i][j];
          maxIndex = j;
        }
      }
      counters[maxIndex] += 1;
    }
    const maxRecognition = counters.reduce((a, b) => {
      return Math.max(a, b);
    });
    return maxRecognition / nModels;
  }

  clear(): void {
    this.models = [];
  }

  buildModel(inputDim: number, numClasses: number): void {
    logger.debug('[MLP] Building a model with layers:', this.parameters.layers);
    this.models = Array.from(Array(this.parameters.numModels.value), () => {
      const model = sequential();
      for (const [i, units] of this.parameters.layers.value.entries()) {
        const layerParams: Parameters<typeof tfLayers.dense>[0] = {
          units,
          activation: 'relu', // potentially add kernel init
        };
        if (i === 0) {
          layerParams.inputDim = inputDim;
        }
        model.add(tfLayers.dense(layerParams));
      }

      model.add(
        tfLayers.dense({
          units: numClasses,
          activation: 'softmax',
        }),
      );
      const optimizer = train.adam();
      model.compile({
        optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
      });
      return model;
    });
  }

  fit(data: TrainingData, epochs = -1): void {
    const numEpochs = epochs > 0 ? epochs : this.parameters.epochs.value;
    const $trainingStreams = []
    for (const model of this.models) {
      const $thisModelTraining = new Stream<TrainingStatus>({ status: 'start', epochs: numEpochs });
      $thisModelTraining.start();
      $trainingStreams.push($thisModelTraining);
      model
        .fit(data.training_x, data.training_y, {
          batchSize: this.parameters.batchSize.value,
          validationData: [data.validation_x, data.validation_y],
          epochs: numEpochs,
          shuffle: true,
          callbacks: {
            onEpochEnd: (epoch, logs) => {
              $thisModelTraining.set({
                status: 'epoch',
                epoch,
                epochs: this.parameters.epochs.value,
                data: {
                  accuracy: logs.acc,
                  loss: logs.loss,
                  accuracyVal: logs.val_acc,
                  lossVal: logs.val_loss,
                },
              });
            },
          },
        })
        .then((results) => {
          logger.debug('[MLP] Training has ended with results:', results);
          $thisModelTraining.set({
            status: 'success',
            data: {
              accuracy: results.history.acc,
              loss: results.history.loss,
              accuracyVal: results.history.val_acc,
              lossVal: results.history.val_loss,
            },
          });
          $thisModelTraining.stop();
        })
        .catch((error) => {
          $thisModelTraining.set({ status: 'error', data: error });
          $thisModelTraining.stop();
          logger.error('[MLP] Training has ended with results:', error);
          throw new Error(error.message);
        })
        .finally(() => {
          data.training_x.dispose();
          data.training_y.dispose();
          data.validation_x.dispose();
          data.validation_y.dispose();
        });
    }
    const $combinedTraining = $trainingStreams.slice(1).reduce(($final, $x) => {
      return $final.zip((b, a) => {
        return a.concat([b]);
      }, $x)
    }, $trainingStreams[0].map(x => [x]));
    $combinedTraining.subscribe((x) => {
      const res: TrainingStatus = {
        status: x[0].status,
        epochs: x[0].epochs,
      };
      if (res.status === 'epoch') {
        res.epoch = x[0].epoch;
        res.data = {
          accuracy: 0,
          loss: 0,
          accuracyVal: 0,
          lossVal: 0,
        };
        for (const y of x) {
          if (Array.isArray(y.data.accuracy)) {
            // console.log('Not implemented...');
          } else {
            res.data.accuracy += y.data.accuracy;
            res.data.loss += y.data.loss;
            res.data.accuracyVal += y.data.accuracyVal;
            res.data.lossVal += y.data.lossVal;
          }
        }
      }
      this.$training.set(res);
    });
  }
}
