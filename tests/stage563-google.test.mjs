// Stage 5.6.3 (owner check 21.10): Google sign-in failed and nothing said why — the token exchange answered
// 401 invalid_client (the client secret copied from the old site is no longer valid) and authHttp threw a generic message.
// A refused provider call now reaches the PHP log with host/path, status and the provider error code only.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {php} from './helpers/site-fixture.mjs';

test('5.6.3 a refused sign-in provider call is logged with host, status and error code — never the query, body or secret',()=>{
 const out=JSON.parse(php(`define('RUBIZH_AUTH',true);require '${process.cwd()}/auth/http.php';echo json_encode([
  authHttpFailureNote('https://oauth2.googleapis.com/token?client_secret=SECRET-123',401,'{"error":"invalid_client","error_description":"The provided client secret is invalid. SECRET-123"}',false),
  authHttpFailureNote('https://www.googleapis.com/oauth2/v1/certs',0,'',true),
  authHttpFailureNote('https://oauth2.googleapis.com/token',400,'<html>'.str_repeat('x',500),false),
  authHttpFailureNote('https://oauth2.googleapis.com/token',400,'{"error":"<script>alert(1)</script>"}',false)]);`).stdout);
 assert.equal(out[0],'rubizh auth http: oauth2.googleapis.com/token status 401 invalid_client');
 assert.equal(out[1],'rubizh auth http: www.googleapis.com/oauth2/v1/certs transport failure');
 assert.equal(out[2],'rubizh auth http: oauth2.googleapis.com/token status 400');
 for(const line of out){assert.doesNotMatch(line,/SECRET|client_secret|<|>|description/);assert.ok(line.length<200);}
});
