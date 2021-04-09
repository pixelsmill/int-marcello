import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, asapScheduler, pipe, of, from, interval, merge, fromEvent, empty } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, map, retry, timeout } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AppConfig } from '../../environments/environment';


@Injectable({
  providedIn: 'root'
})
export class MainService {
  base:string = AppConfig.datasServer;

  timeoutDelay:number = 5000;
  retryNb:number = 10;

  datas:any;



  headers = new Headers({
        'Cache-Control':  'no-cache, no-store, must-revalidate, post-check=0, pre-check=0',
        'Pragma': 'no-cache',
        'Expires': '0'
    });


  constructor(
    private httpClient:HttpClient
  ) {
    // console.log(AppConfig);
    //
    // this.datasName = this.findGetParameter('datas');
    // console.log("this.datasName", this.datasName);


    // si dév > http://localhost:8080/apps/dev/int-marcelle/dist/?datas=bacteries
    // call http://localhost:8080/apps/datas/bacteries/datas.json

    // si prod > http://localhost:8080/apps/dev/int-marcelle/dist/?datas=bacteries
    // call http://localhost:8080/apps/datas/bacteries/datas.json


    // this.base = 'http://192.168.0.123:80/apps/datas/';
    // this.base = 'https://expo-intelligence.org/apps/datas/';
    // this.base = '../../../datas/';
  }

  public loadDatasName(): Observable<any> {
    let rnd = Math.round(9999999999999*Math.random());
    return this.httpClient.get<any>(this.base+"select.txt?"+rnd, { responseType: 'text' as 'json'})
      .pipe(
        timeout(this.timeoutDelay),
        retry(this.retryNb),
        catchError((err, caught) => this.handleErrorObservable(err, caught))
      );
  }
  public loadDatas(datasName:string): Observable<any> {
    let rnd = Math.round(9999999999999*Math.random());
    return this.httpClient.get<any>(this.base+datasName+"/datas.json?"+rnd)
      .pipe(
        timeout(this.timeoutDelay),
        retry(this.retryNb),
        catchError((err, caught) => this.handleErrorObservable(err, caught))
      );
  }
  public loadDatasDev(datasName:string): Observable<any> {
    let rnd = Math.round(9999999999999*Math.random());
    return this.httpClient.get<any>(this.base+datasName+"/datasdev.json?"+rnd)
      .pipe(
        timeout(this.timeoutDelay),
        retry(this.retryNb),
        catchError((err, caught) => this.handleErrorObservable(err, caught))
      );
  }
  public loadVideoFolders(datasName:string): Observable<any> {
    let rnd = Math.round(9999999999999*Math.random());
    return this.httpClient.get<any>(this.base+datasName+"/videos.json?"+rnd)
      .pipe(
        timeout(this.timeoutDelay),
        retry(this.retryNb),
        catchError((err, caught) => this.handleErrorObservable(err, caught))
      );
  }
  private handleErrorObservable(error: any, caught): Observable<any> {
    if (error.status == "401"){
      console.log("Erreur 401 : Accès refusé, redirection en cours");
      // this.router.navigate(['/dashboard']);
    } else {
      console.error("datas.json mal formaté ou introuvable :", error); // for demo purposes only
    }
    return empty();
  }

}
