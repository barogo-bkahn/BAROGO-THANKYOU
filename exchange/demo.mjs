import {start} from './server.mjs';
await start({...process.env,EXCHANGE_DEMO:'1'});
