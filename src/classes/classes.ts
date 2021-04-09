export class MarcelloOutputs {
  public categories:Array<Category>;
  public result:Category;
  public confidence:number;
  constructor(){
    this.categories = [];
  }
  public best():Category {
    if (!this.categories.length) return;
    return [...this.categories].sort((a, b) => b.p - a.p)[0];
  }
}
export class Category {
  public id:number;
  public name:string;
  public desc:string;
  public p:number;
}
