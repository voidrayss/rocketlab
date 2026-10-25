let worker=null, pending=null, next=0;
export function runCAD(job) {
  if(pending) return Promise.reject(new Error('A CAD operation is already running.'));
  worker ??= new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
    const id=++next;
    const timer=setTimeout(()=>finish(new Error('CAD operation timed out. Try a smaller model.')),90000);
    function finish(error,result) {
      clearTimeout(timer);pending=null;
      if(error) {worker.terminate();worker=null;reject(error);} else resolve(result);
    }
    pending=id;
    worker.onmessage=({data})=>{if(data.id===id) finish(data.error?new Error(data.error):null,data.result);};
    worker.onerror=()=>finish(new Error('CAD kernel could not load. Check the internet connection.'));
    worker.postMessage({id,job});
  });
}
