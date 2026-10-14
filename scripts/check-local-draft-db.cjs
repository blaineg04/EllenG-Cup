#!/usr/bin/env node
// Read-only preflight for a disposable LOCAL PostgreSQL draft-test database.
// Never connects to a database or executes SQL.
const { URL } = require('node:url');
const urlText=process.env.ELLENG_TEST_DATABASE_URL;
if(!urlText){
  console.error('Set ELLENG_TEST_DATABASE_URL to a disposable local PostgreSQL URL (localhost or 127.0.0.1).');
  process.exitCode=2;
} else {
  try{
    const url=new URL(urlText);
    const host=url.hostname.toLowerCase();
    const db=decodeURIComponent(url.pathname.replace(/^\//,'')).toLowerCase();
    const safeHost=['localhost','127.0.0.1','::1','[::1]'].includes(host);
    const safeDb=/^(elleng_test|elleng_draft_test|elleng_ci_test)$/.test(db);
    if(!['postgres:','postgresql:'].includes(url.protocol)||!safeHost||!safeDb){
      console.error('Refusing nonlocal or non-test database target. Allowed hosts: localhost, 127.0.0.1, ::1; allowed databases: elleng_test, elleng_draft_test, elleng_ci_test.');
      process.exitCode=2;
    }else{
      console.log('Local draft database target passes host and name checks. No connection or SQL was executed.');
    }
  }catch{
    console.error('Invalid PostgreSQL URL. No connection attempted.');
    process.exitCode=2;
  }
}
