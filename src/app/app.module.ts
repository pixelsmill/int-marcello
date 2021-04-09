import 'reflect-metadata';
import '../polyfills';

import { BrowserModule, HAMMER_GESTURE_CONFIG, HammerGestureConfig, HammerModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { NgxElectronModule } from 'ngx-electron';


import { AppComponent } from './app.component';


import * as Hammer from 'hammerjs';

// making hammer config (3)
export class MyHammerConfig extends HammerGestureConfig {
  overrides = <any>{
    swipe: { direction: Hammer.DIRECTION_ALL },
  };
};

// AoT requires an exported function for factories

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
    NgxElectronModule,
    HammerModule
  ],
  providers: [{ provide: HAMMER_GESTURE_CONFIG, useClass: MyHammerConfig }],
  bootstrap: [AppComponent]
})

export class AppModule {}
