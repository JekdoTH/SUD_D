import {DatabaseSync} from 'node:sqlite';

/** TEST ONLY: Node SQLite is a genuine SQLite engine, but not
 * better-sqlite3 or its Electron ABI. Never import this in production. */
export class DisposableBetterSqlite3Adapter {
  private readonly db:DatabaseSync;
  private active=true;
  constructor(filename:string){
    this.db=new DatabaseSync(filename);
  }
  get open(){return this.active;}
  close(){this.db.close();this.active=false;}
  exec(sql:string){return this.db.exec(sql);}
  pragma(sql:string){const s=this.db.prepare('PRAGMA '+sql);
    try{return s.all();}catch{this.db.exec('PRAGMA '+sql);return [];}
  }
  prepare(sql:string){return this.db.prepare(sql);}
  transaction<T extends (...args:any[])=>any>(fn:T){
    const run=(kind:'IMMEDIATE'|'DEFERRED'|'EXCLUSIVE')=>(...args:Parameters<T>):ReturnType<T>=>{
      this.db.exec('BEGIN '+kind);
      try{const result=fn(...args);this.db.exec('COMMIT');return result;}
      catch(error){this.db.exec('ROLLBACK');throw error;}
    };
    const tx=run('DEFERRED');
    return Object.assign(tx,{immediate:run('IMMEDIATE'),
      deferred:tx,exclusive:run('EXCLUSIVE')});
  }
}
