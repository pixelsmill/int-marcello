import { Component, ViewChild, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { MainService } from './core/main.service';
import { AppConfig } from '../environments/environment';
import { BrowserModule, DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import {Title} from "@angular/platform-browser";
import {Subscription, interval, timer} from 'rxjs';
import { ElectronService } from 'ngx-electron';

import { MarcelloOutputs, Category } from "../classes/classes";

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

  @ViewChild('network', {static: false}) networkSvg : ElementRef;
  @ViewChild('video', {static: false}) videoTag : ElementRef;
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
    this.startGame()
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
    this.simulateMarcello();
  }

  simulateMarcello():void
  {
    let randomTimer = timer(0, 2000);
    let blinkTimer = timer(0, 1000/25);
    randomTimer.subscribe(() => { // randomize results from marcello
      this.changeMarcelloValues(Math.random(), Math.random(), Math.random(), Math.random(), Math.random())
    });
    blinkTimer.subscribe(() => { // blinking network
      let lines = this.networkSvg.nativeElement.getElementsByTagName("line");
      for (let i=0; i<lines.length; i++){
        lines.item(i).setAttribute('stroke', 'rgba(239, 64, 35, '+Math.random()+')');
      }
    });
  }

  changeMarcelloValues(p0:number, p1:number, p2:number, p3:number, confidence:number){
    this.marcello.categories[0].p = p0;
    this.marcello.categories[1].p = p1;
    this.marcello.categories[2].p = p2;
    this.marcello.categories[3].p = p3;
    this.marcello.confidence = confidence;
  }

  clean():void
  {
    // clean canvas
  }
  onMatch():void
  {
    // Marcello is right !
  }
  onCategory(cat:Category):void
  {
    // Marcello is wrong...
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
