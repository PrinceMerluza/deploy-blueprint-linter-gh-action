const fs = require('fs');
const { Octokit } = require("@octokit/rest");
const { createCipheriv } = require('crypto');

const octokit = new Octokit({
  auth: '', // TOKEN HERE
});

// cooldown between repo updates in seconds. 
// This is because multiple simultaneous updates sometimes cause the linter-results
// to error and not push the results
const COOLDOWN_SEC = 120;  
const BLUEPRINT_ORG = 'GenesysCloudBlueprints';
const REPO_EXCEPTIONS = ['genesyscloud-blueprint-linter-results', // Results repo should always be an exception
      'agent-monitoring-app-blueprint',
      'bot-connector-for-ms-power-virtual-agent',
      'vonage-video-blueprint',
      'analytics-detail-record-metrics-blueprint',
      'angular-app-with-genesys-cloud-sdk',
      'automated-callback-blueprint',
      'chat-assistant-blueprint',
      'chat-translator-blueprint',
      'design-architect-flow-data-actions-for-resiliency',
      'dialogflow-rapid-response-virtual-agent-blueprint',
      'digital-messaging-translator-blueprint',
      'email-translator-blueprint',
      'slack-open-messaging-blueprint',
      'usage-api-blueprint',
      'web-messaging-triage-bot-blueprint',
    ];

let shellScriptb64 = '';
let workflowb64 = '';

async function readFiles(){
  const promises = [
    new Promise((resolve, reject) => {
      console.log('Reading ./workflow/display-error.sh');
      fs.readFile('./workflow/display-error.sh', 'utf8' , (err, data) => {
        if (err) reject(err);

        shellScriptb64 = Buffer.from(data).toString('base64');
        resolve();
      });
    }),
    new Promise((resolve, reject) => {
      console.log('Reading ./workflow/test.yml');
      fs.readFile('./workflow/test.yml', 'utf8' , (err, data) => {
        if (err) reject(err);

        workflowb64 = Buffer.from(data).toString('base64');
        resolve();
      });
    }),
  ];

  return Promise.all(promises);
}

async function getBlueprintRepos(){
  // Get authenticated user
  const user = await octokit.rest.users.getAuthenticated();
  const userName = user.data.login;

  // Get GenesysCloudBlueprints repos that current user have access to
  const userRepos = await octokit.rest.repos.listForUser({
    username: userName,
    type: 'all',
  });
  const blueprints = userRepos.data.filter(repo => {
    return repo.owner.login == BLUEPRINT_ORG && !REPO_EXCEPTIONS.includes(repo.name);
  });

  console.log('--------------');
  console.log('BLUEPRINTS TO BE UPDATED');
  blueprints.forEach(bp => {
    console.log(bp.name);
  });
  console.log(`---------- TOTAL: ${blueprints.length}`);
  return blueprints;
}

async function updateBlueprints(blueprints){
  const sleep = (time) => {
    return new Promise((resolve) => setTimeout(resolve, Math.ceil(time * 1000)));
  };

  for(let i = 0; i < blueprints.length; i++){
    const bp = blueprints[i];
    await updateBlueprint(bp);

    console.log('Paused to allow linter results to process dispatch.')
    await sleep(COOLDOWN_SEC);
    console.log('Resuming...');
  }
}

async function updateBlueprint(bp){
  let shellScriptSHA = '';
  let linterWorkflowSHA = '';

  // Check if repo already has the shell script in the workflows folder
  try {
    let result = await octokit.rest.repos.getContent({
      owner: BLUEPRINT_ORG,
      repo: bp.name,
      path: '.github/workflows/display-error.sh',
    });
    shellScriptSHA = result.data.sha;
    console.log(`${bp.name} shell script sha: ${shellScriptSHA}`);
  } catch(e) {
    console.log(`${bp.name} has no display-error.sh`);
  }

  // Check if repo already has the test.yml in the workflows folder
  try {
    let result = await octokit.rest.repos.getContent({
      owner: BLUEPRINT_ORG,
      repo: bp.name,
      path: '.github/workflows/test.yml',
    });
    linterWorkflowSHA = result.data.sha;
    console.log(`${bp.name} workflow yaml sha: ${linterWorkflowSHA}`);
  } catch(e) {
    console.log(`${bp.name} has no test.yml`);
  }

  // Create/Update the files
  let body = {
    owner: BLUEPRINT_ORG,
    repo: bp.name,
    path: '.github/workflows/display-error.sh',
    message: 'Update display-error.sh',
    content: shellScriptb64,
  };
  if(shellScriptSHA.length > 0){
    body.sha = shellScriptSHA;
  }
  await octokit.rest.repos.createOrUpdateFileContents(body);

  body = {
    owner: BLUEPRINT_ORG,
    repo: bp.name,
    path: '.github/workflows/test.yml',
    message: 'Update test.yml',
    content: workflowb64,
  };
  if(linterWorkflowSHA.length > 0){
    body.sha = linterWorkflowSHA;
  }
  await octokit.rest.repos.createOrUpdateFileContents(body);

  console.log(`- Updated workflow of ${bp.name}`);
}

async function main(){
  try {
    await readFiles();
  } catch (e){
    console.error(e);
    return;
  }
  const blueprints = await getBlueprintRepos();
  updateBlueprints(blueprints);
}

main();
