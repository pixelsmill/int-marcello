import { Component, ViewChild, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { MainService } from './core/main.service';
import { AppConfig } from '../environments/environment';
import { BrowserModule, DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import {Title} from "@angular/platform-browser";
import { Subscription, interval, timer, fromEvent } from 'rxjs';
import { takeUntil, pairwise, switchMap, debounceTime, take } from 'rxjs/operators';
import { ElectronService } from 'ngx-electron';

import { MarcelloOutputs, Category, Match } from "../classes/classes";
import { addToDataset, predict, setup } from '../marcelle';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private datasServer:any;
  public datasName:any;
  public base:string;
  public datas:any;
  public datasdev:any;
  private activityDelay:number = 5*60*1000; //ms
  private activitySubscription:Subscription;
  private espaces:Array<any> = [
    { name: 'Végétale', color: '#fbab18' },
    { name: 'Animale', color: '#ee4991' },
    { name: 'Humaine', color: '#00aab0' },
    { name: 'Artificielle', color: '#ef4023' }
  ];
  public espace = this.espaces[3];
  public current:string = 'loading';
  public bgImage:any;

  // Marcello Datas (see ../classes/classes.ts)
  public marcello:MarcelloOutputs;
  public labels:Array<string> = ['Chapeau', 'Lune', 'Fromage', '?'];
  public categories:Array<Category> = [
    { id: 0, name: 'Chapeau', desc: 'un chapeau', p: 0, lastMatch: undefined },
    { id: 1, name: 'Lune', desc: 'une lune', p: 0, lastMatch: undefined },
    { id: 2, name: 'Fromage', desc: 'un fromage', p: 0, lastMatch: undefined },
    { id: 3, name: 'Mystère...', desc: 'votre secret', p: 0, lastMatch: undefined }
  ];

  private cx: CanvasRenderingContext2D;
  private canvas:HTMLCanvasElement; // px
  private canvasSize:number = 480; // px
  public virgin:boolean;
  public wrong:boolean = false;
  public history:Array<any>;

  public helperShown;

  public step: number; // 0, 1, 2

  public marcellaText: string;
  public marcellaMuted: boolean;
  public marcelloLearned:boolean;
  public readyForNextStep:boolean;

  @ViewChild('network', {static: false}) networkSvg : ElementRef;
  @ViewChild('canvas', {static: false}) canvasTag: ElementRef;
  constructor(
    private service: MainService,
    public sanitizer:DomSanitizer,
    private titleService: Title,
    private electron: ElectronService
  ) { }

  ngOnInit():void
  {
    if (window.hasOwnProperty('process') && window['process'].hasOwnProperty('versions') && window['process']['versions'].hasOwnProperty('electron')){ // electron
      let response:any = this.electron.ipcRenderer.sendSync('ping');
      this.datasName = response;
    } else {
      this.datasName = this.findGetParameter('datas');
    }
    this.base = AppConfig.datasServer;
    this.loadDatas();
    setup(this.categories);
  }

  ngAfterContentInit():void
  {
  }

  loadDatas():void
  {
    this.current = 'loading';
    // this.service.loadDatasDev(this.datasName).subscribe((datas => {
    //   this.datasdev = datas;
      this.service.loadDatas(this.datasName).subscribe((datas => {
        this.datas = datas;
        console.log(datas);
        this.titleService.setTitle( this.datas.name );
        this.start();
      }));
    // }));
  }

  onClick():void // listen to user event to prevent auto reset after long unactivity
  {
    if (this.activitySubscription){
      this.activitySubscription.unsubscribe();
      delete this.activitySubscription;
    }
    this.activitySubscription = timer(this.activityDelay).subscribe(() => {
      this.goHome();
    });
  }

  start():void // start app
  {
    this.bgImage = this.sanitizer.bypassSecurityTrustStyle('url('+ this.base+this.datasName+'/files/'+this.datas.image +')');
    this.goHome();
  }

  clear(){
    this.marcellaMuted = true;
    this.step = 0;
  }

  goHome():void // go to splash screen
  {
    this.clear();
    this.current = 'splash';
  }


  onSplashClick():void // click splash screen
  {
    if (AppConfig.name == 'web'){
      if (!document.fullscreenElement){ document.documentElement.requestFullscreen(); }
    }
    this.startGame();
  }

  startGame():void
  {
    this.current = 'game';
    this.marcello = new MarcelloOutputs();
    this.marcello.categories = this.categories;
    this.marcello.confidence = 0.35;
    this.history = [];
    this.marcelloLearned = false;
    this.readyForNextStep = false;
    timer(1000).pipe(take(1)).subscribe(() => {
      this.initCanvas();
      this.goMarcella();
    });
  }

  initCanvas():void
  {
    this.canvas = this.canvasTag.nativeElement;
    this.cx = this.canvas.getContext('2d');

    // set the width and height
    this.canvas.width = this.canvasSize;
    this.canvas.height = this.canvasSize;

    // set some default properties about the line
    this.cx.lineWidth = 15;
    this.cx.lineCap = 'round';
    this.cx.strokeStyle = '#000';
    this.cx.fillStyle = '#fff';

    this.clean();
    this.cleanLines();
    this.captureEvents();
  }

  captureEvents() {
    let event = fromEvent(this.canvas, 'mousedown')
      .pipe(
        switchMap((e) => {
          return fromEvent(this.canvas, 'mousemove')
            .pipe(
              takeUntil(fromEvent(this.canvas, 'mouseup')),
              takeUntil(fromEvent(this.canvas, 'mouseleave')),
              pairwise() // pairwise lets us get the previous value to draw a line from // the previous point to the current point
            )
        })
      );

      event.subscribe((res: [MouseEvent, MouseEvent]) => {
        const rect = this.canvas.getBoundingClientRect();
        const prevPos = {
          x: res[0].clientX - rect.left,
          y: res[0].clientY - rect.top
        };
        const currentPos = {
          x: res[1].clientX - rect.left,
          y: res[1].clientY - rect.top
        };
        this.drawOnCanvas(prevPos, currentPos);
      });

      event.pipe(
        debounceTime(250)
      ).subscribe(() => {
        this.compute();



      });
  }

  private drawOnCanvas(
    prevPos: { x: number, y: number },
    currentPos: { x: number, y: number }
  ) {
    if (!this.cx) { return; }
    this.cx.beginPath();
    if (prevPos) {
      this.cx.moveTo(prevPos.x, prevPos.y); // from
      this.cx.lineTo(currentPos.x, currentPos.y);
      this.cx.stroke();
      this.virgin = false;
    }
  }

  changeLines():void
  {
    let blinkTimer = timer(0, 1000/25);
    blinkTimer.pipe(take(1*25)).subscribe(() => { // blinking network
      let lines = this.networkSvg.nativeElement.getElementsByTagName("line");
      for (let i=0; i<lines.length; i++){
        lines.item(i).setAttribute('stroke', 'rgba(239, 64, 35, '+Math.random()+')');
      }
    });
  }
  changeLinesWidth():void
  {
    let blinkTimer = timer(0, 1000/25);
    blinkTimer.pipe(take(1*25)).subscribe(() => { // blinking network
      let lines = this.networkSvg.nativeElement.getElementsByTagName("line");
      for (let i=0; i<lines.length; i++){
        lines.item(i).setAttribute('stroke-width', 1+2*Math.random())+'px';
      }
    });
  }

  cleanLines():void
  {
    let lines = this.networkSvg.nativeElement.getElementsByTagName("line");
    for (let i=0; i<lines.length; i++){
      lines.item(i).setAttribute('stroke', 'rgba(239, 64, 35, 0.5)');
    }
  }

  changeMarcelloValues(confidences: Record<string, number>, certainty:number):void
  {
    for (const [label, conf] of Object.entries(confidences)) {
      const idx = this.marcello.categories.map(({ name }) => name).indexOf(label);
      this.marcello.categories[idx].p = conf;
    }
    this.marcello.confidence = certainty;
  }

  clean():void
  {
    this.cx.rect(0, 0, this.canvasSize, this.canvasSize);
    this.cx.fill();
    this.changeMarcelloValues(
      this.categories.reduce((x, { name }) => ({ ...x, [name]: 0 }), {}),
      0,
    );
    this.virgin = true;
  }

  onMatch(bool:boolean):void
  {
    if (bool){
      let cat = this.marcello.best();
      this.save(true, cat);
    } else {
      this.wrong = true;
    }
  }

  onCategory(cat:Category):void
  {
    this.save(false, cat);
  }

  getImage(): ImageData {
    return this.cx.getImageData(0, 0, this.canvas.width, this.canvas.height)
  }

  async compute(): Promise<void>
  {
    const imgData = this.getImage();
    const { confidences, certainty } = await predict(imgData)
    this.wrong = false;
    this.changeMarcelloValues(confidences, certainty);
    this.changeLines();
  }

  save(success:boolean, category:Category):void
  {
    let cat = this.categories.find((cat) => cat.id == category.id);
    if (success){
      cat.lastMatch = new Match(success, this.marcello.confidence);
    }

    let dataURL = this.canvas.toDataURL();
    this.history.push(dataURL);

    const imgData = this.getImage();
    addToDataset(imgData, category.name);

    this.marcelloLearned = true;
    this.goMarcella(success, category);

  }

  goMarcella(success:boolean = false, category:Category = undefined):void {
    let best = this.marcello.best();
    if (this.step == 0){
      if (!best){
        // t0_0
        this.marcellaSay("Nous allons commencer par apprendre à Marcello à reconnaitre un chapeau. Marcello va tenter de deviner, dites-lui s'il s'est trompé ou pas.");
      } else if (best.id != 0){
        // t0_1
        this.marcellaSay('Votre chapeau n\'a pas été reconnu, mais l\'erreur va être prise en compte par Marcello. Recommencez !');
      } else if (best.id == 0 && this.marcello.confidence < 0.75){
        // t0_2
        this.marcellaSay('Votre chapeau a été reconnu, mais la confiance est encore faible. Marcello va progresser. Recommencez !');
      } else {
        // t0_3
        this.marcellaSay('Votre chapeau a été reconnu avec une confiance suffisante.');
        this.readyForNextStep = true;
      }
    } else if (this.step == 1){
      if (!best){
        // t1_0
        this.marcellaSay("Apprenez-lui à reconnaître une lune et un fromage.");
      } else if (best.id == 0){
        // t1_1
        this.marcellaSay("Marcello a tendance à voir des chapeau partout, puisque jusqu'ici, c'était tjs des chapeaux. Recommencez à dessiner une lune ou un fromage.");
      } else if (!success){
        // t1_2
        this.marcellaSay("Il va falloir insister un peu. Recommencez à dessiner une lune ou un fromage.");
      } else if (best.id == 3){
        // t1_3
        this.marcellaSay("Il va falloir insister un peu. Recommencez à dessiner une lune ou un fromage.");
      } else {
        if (this.marcello.confidence < 0.75){
          if (best.id == 1){
            // t1_4
            this.marcellaSay('Votre lune a été reconnu, mais la confiance est encore faible. Marcello progresse. Recommencez !');
          } else if (best.id == 2){
            // t1_5
            this.marcellaSay('Votre fromage a été reconnu, mais la confiance est encore faible. Marcello progresse. Recommencez !');
          }
        } else {
          let matches = this.categories.filter((category) => (category.id == 1 || category.id == 2) && category.lastMatch && category.lastMatch.correct && category.lastMatch.confidence > 0.75);
          if (matches.length == 2){
            // t1_6
            this.marcellaSay('Bravo, vous avez bien appris à Marcello à reconnaitre la lune et un fromage en plus du chapeau.');
            this.readyForNextStep = true;
          } else if (best.id == 1){
            // t1_7
            this.marcellaSay('Vous avez bien appris à Marcello à reconnaître la lune, faites-en autant avec le fromage.');
          } else if (best.id == 2){
            // t1_8
            this.marcellaSay('Vous avez bien appris à Marcello à reconnaître la lune, faites-en autant avec le fromage.');
          }
        }
      }
    } else if (this.step == 2){
      if (!best){
        // t2_0
        this.marcellaSay("Ultime étape, fermez les yeux et pensez à quelque chose sans le dire à personne, ce sera votre objet mystére. Puis apprennez à Marcello ce nouvel objet.");
      } else if (!success){
        // t2_1
        this.marcellaSay("Marcello a tendance à voir des chapeaux, des lunes et des fromages partout.");
      } else if (this.marcello.confidence < 0.75){
        // t2_2
        this.marcellaSay("Marcello l'a bien reconnu mais sa confiance est encore trop faible. Redessinez votre objet mystère.");
      } else {
        // t2_3
        this.marcellaSay("Marcello l'a bien reconnu et sa confiance est bonne. Redessinez votre objet mystère.");
        this.readyForNextStep = true;
      }
    } else if (this.step == 3){
      // t3_0
      if (!best){
        this.marcellaSay("Ca y est, vous avez tout appris à Marcello. Vous êtes libre de poursuivre. Marcello est-il capable de reconnaitres d'autres types de chapeaux ? Haut-de-formes et casquettes ? Peut-t-on finir par le tromper en lui donnant de fausse indication ?");
      }
    }
  }

  onOkMarcella():void
  {
    this.marcellaMute();
    if (this.marcelloLearned){
      let marcelleObservable = timer(1000).pipe(take(1)); // /!\ replace with real observable on Marcelle
      marcelleObservable.subscribe(() => {
        this.changeLinesWidth();
        this.clean();
        this.nextStepIfReady();
      });
    } else {
      this.nextStepIfReady();
    }
  }

  nextStepIfReady(){
    if (this.readyForNextStep){
      this.readyForNextStep = false;
      this.step += 1;
      this.goMarcella();
    }
  }

  onAllo():void
  {
    this.marcelloLearned = false;
    this.marcellaMuted = false;
  }

  marcellaSay(text:string):void
  {
    this.marcellaText = text;
    this.marcellaMuted = false;
  }
  marcellaMute():void
  {
    this.marcellaMuted = true;
  }
  showHelper(helper):void
  {
    this.helperShown = helper;
  }
  hideHelper():void
  {
    delete this.helperShown;
  }

  /**********************************************************************/
  /* TOOLS **************************************************************/

  findGetParameter(parameterName:string):void
  {
      let result = null,
          tmp = [];
      let items = location.search.substr(1).split("&");
      for (let index = 0; index < items.length; index++) {
          tmp = items[index].split("=");
          if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
      }
      return result;
  }
}
