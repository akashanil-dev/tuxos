const CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
export function createKonamiTracker() {
  let pos=0,last=0;
  return (key:string,time:number) => {
    if(time-last>3000)pos=0;last=time;
    const normalized=key.length===1?key.toLowerCase():key;
    pos=normalized===CODE[pos]?pos+1:normalized===CODE[0]?1:0;
    if(pos===CODE.length){pos=0;return true;}return false;
  };
}
