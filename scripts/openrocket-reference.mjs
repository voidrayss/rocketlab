// Optional external benchmark, never part of the website runtime or smoke-test prerequisites.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {resolve,delimiter} from 'node:path';
const jar=process.env.OPENROCKET_JAR || '/Applications/OpenRocket.app/Contents/Resources/app/jar/OpenRocket-24.12.jar';
const java=process.env.OPENROCKET_JAVA || '/Applications/OpenRocket.app/Contents/Resources/jre.bundle/Contents/Home/bin/java';
const directory=mkdtempSync(tmpdir()+'/rocketlab-openrocket-');
const compile=spawnSync(process.env.JAVAC || 'javac',['-d',directory,resolve('scripts/reference/Reference.java')],{encoding:'utf8',timeout:30000});
if(compile.status!==0) throw new Error('Benchmark requires a JDK compiler. '+(compile.stderr||compile.error?.message));
const run=spawnSync(java,[`-Djava.util.prefs.userRoot=${directory}/prefs`,'-cp',directory+delimiter+jar,'Reference'],{encoding:'utf8',timeout:30000});
if(run.status!==0)throw new Error('OpenRocket reference failed: '+(run.stderr||run.stdout||run.error?.message));
const cases=run.stdout.split('\n').filter(line=>line.startsWith('REFERENCE ')).map(line=>JSON.parse(line.slice(10)));
if(cases.length!==2)throw new Error('Expected two reference cases.');
const digest=createHash('sha256');for await(const chunk of createReadStream(jar))digest.update(chunk);
const result={engine:'OpenRocket 24.12',date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),jarSha256:digest.digest('hex'),conditions:{mach:.1,aoaRadians:0,temperatureK:288.15,pressurePa:101325,bodyFinish:'Regular paint (60 µm)',motor:'none',noseLengthM:.15,diameterM:.05,bodyLengthM:.35,noseWallM:.002,bodyWallM:.001,finCount:3,rootChordM:.08,tipChordM:.04,spanM:.05,sweepM:.04,finThicknessM:.003,finCrossSection:'SQUARE',finFilletRadiusM:0,noseDensity:1200,bodyDensity:680,finDensity:600,noseShoulderLengthM:0,noseX:0,bodyX:.15,finRootX:.42},cases};
const output=directory+'/reference.json';writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));console.log('Output: '+output);
