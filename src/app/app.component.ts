import { Component, ViewChild, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { MainService } from './core/main.service';
import { AppConfig } from '../environments/environment';
import { BrowserModule, DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import {Title} from "@angular/platform-browser";
import { Subscription, interval, timer, fromEvent } from 'rxjs';
import { takeUntil, pairwise, switchMap, debounceTime, take } from 'rxjs/operators';
import { ElectronService } from 'ngx-electron';

import { MarcelloOutputs, Category } from "../classes/classes";
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
    { id: 0, name: 'Chapeau', desc: 'un chapeau', p: 0 },
    { id: 1, name: 'Lune', desc: 'une lune', p: 0 },
    { id: 2, name: 'Fromage', desc: 'un fromage', p: 0 },
    { id: 3, name: '?', desc: 'votre truc', p: 0 }
  ];

  private cx: CanvasRenderingContext2D;
  private canvas:HTMLCanvasElement; // px
  private canvasSize:number = 480; // px
  public virgin:boolean;
  public saving:boolean;
  public history:Array<any>;

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
    // this.loadDatas();
    setup(this.categories);
    this.startGame()
  }

  ngAfterContentInit():void
  {
  }

  loadDatas():void
  {
    this.current = 'loading';
    this.service.loadDatasDev(this.datasName).subscribe((datas => {
      this.datasdev = datas;
      this.service.loadDatas(this.datasName).subscribe((datas => {
        this.datas = datas;
        this.titleService.setTitle( this.datas.name );
      }));
    }));
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

  goHome():void // go to splash screen
  {
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
    this.saving = false;
    timer(1000).pipe(take(1)).subscribe(() => this.initCanvas());
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

  onMatch():void
  {
    console.log('Marcello is right !');
    let cat = this.marcello.best();
    this.save(true, cat);
  }

  onCategory(cat:Category):void
  {
    console.log('Marcello is wrong...');
    this.save(false, cat);
  }

  getImage(): ImageData {
    return this.cx.getImageData(0, 0, this.canvas.width, this.canvas.height)
  }

  async compute(): Promise<void>
  {
    const imgData = this.getImage();
    const { confidences, certainty } = await predict(imgData)
    this.changeMarcelloValues(confidences, certainty);
    this.changeLines();
  }

  save(success:boolean, cat:Category):void
  {
    console.log(success, cat);

    let dataURL = this.canvas.toDataURL();
    this.history.push(dataURL);

    const imgData = this.getImage();
    addToDataset(imgData, cat.name);

    this.saving = true;
    let marcelleObservable = timer(1000).pipe(take(1)); // /!\ replace with real observable on Marcelle
    marcelleObservable.subscribe(() => {
      this.clean();
      this.saving = false;
    });
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
