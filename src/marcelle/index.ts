import { mobilenet, mlp, dataset, dataStore, dashboard, datasetBrowser, trainingProgress, trainingPlot, button } from '@marcellejs/core';
import { Category } from 'src/classes/classes';
import { DeepEnsemble } from './deep-ensemble';

const featureExtractor = mobilenet();
const store = dataStore({ location: 'localStorage' });
const trainingSet = dataset({ name: 'training-set', dataStore: store });
let classifier = new DeepEnsemble({ dataStore: store }) // .sync('main-mlp');
classifier.$training.subscribe(console.log)

// // == DEBUG START
// // to debug, add to index.html:
// // <link rel="stylesheet" href="https://unpkg.com/@marcellejs/core@0.3.1/dist/marcelle.css">
// //
// const b = button({ text: 'train' })
// b.$click.subscribe(() => {
//   classifier.train(trainingSet, categories);
// })
// const dash = dashboard({ title: 'Marcello', author: 'TBD', closable: true });
// dash.page('Main')
// .use(datasetBrowser(trainingSet))
// .use(b, trainingProgress(classifier), trainingPlot(classifier));
// window['dash'] = dash;
// // == DEBUG END

let categories: Array<string> = [];
export function setup(cats:Array<Category>) {
  categories = cats.map(({ name }) => name);
  classifier.labels = categories;
  classifier.buildModel(1024, categories.length);
}

export async function addToDataset(img: ImageData, label: string) {
  const instance = {
    type: 'image',
    data: img,
    features: await featureExtractor.process(img),
    label,
  }
  trainingSet.addInstance(instance);
}

trainingSet.$changes.subscribe(async (changes) => {
  for (const { level, type } of changes) {
    if (['instance', 'dataset'].includes(level) && type === 'created') {
      try {
        classifier.train(trainingSet, categories);
      } catch (error) {
        console.log('Training error', error)
      }
    }
  }
})

export async function predict(img: ImageData) {
  if (!classifier) return;
  const features = await featureExtractor.process(img);
  const preds = await classifier.predict(features);
  return preds;
}

export async function reset() {
  await trainingSet.clear();
  classifier.train(trainingSet, categories);
}

