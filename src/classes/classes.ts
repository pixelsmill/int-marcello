export class MarcelloOutputs {
  public categories:Array<Category>;
  public result:Category;
  public confidence:number;
  constructor(){
    this.categories = [];
  }
  public best():Category {
    if (!this.categories.length) return;
    let best = [...this.categories].sort((a, b) => b.p - a.p)[0];
    if (best.p == 0){
      best = undefined;
    }
    return best;
  }
}
export class Category {
  public id:number;
  public name:string;
  public desc:string;
  public p:number;
  public lastMatch: Match;
}
export class Match {
  constructor(public correct:boolean, public confidence:number){ }
}
