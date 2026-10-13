const LocalMarksData = (() => {
  async function mutate(command){
    const reply=await chrome.runtime.sendMessage({type:'LOCAL_MARKS_MUTATE',command});
    if(!reply?.ok)throw Error(reply?.error||'保存未完成，请重试');
    return reply.result;
  }
  async function usage(){
    const bytes=await chrome.storage.local.getBytesInUse(null);
    const limit=chrome.storage.local.QUOTA_BYTES||10485760;
    return {bytes,limit,ratio:bytes/limit};
  }
  return {mutate,usage};
})();
