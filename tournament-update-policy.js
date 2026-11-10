(function(root){
 const canRefresh=({online,live=false,saving=false,pending=0,editing=false})=>online===true&&!live&&!saving&&!pending&&!editing;
 const api={canRefresh};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EllenGUpdatePolicy=api;
})(typeof window!=='undefined'?window:globalThis);
