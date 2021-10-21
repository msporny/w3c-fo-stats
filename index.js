const axios = require('axios');
const {decode} = require('html-entities');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const prompt = require("prompt-sync")({ sigint: true });

// get W3C account login details
const w3caccount = prompt("What is your W3C username? ");
const w3cpassword = prompt("What is your W3C password? ", {echo: '*'});

// set directories and paths
const tmpDir = path.join('tmp', 'w3c-fo-stats');
const votesFile = path.join(tmpDir, 'votes.html');
const acRepsFile = path.join(tmpDir, 'ac-reps.html');
const resultsDir = path.join(tmpDir, 'results');

// create directories
mkdirp.sync(tmpDir);
mkdirp.sync(resultsDir);

// set up basic auth for all requests
axios.interceptors.request.use((config) => {
  config.headers.authorization = 'Basic ' +
    Buffer.from(w3caccount + ':' + w3cpassword).toString('base64')
  return config;
}, null, { synchronous: true });

// analyze W3C Advisory Committee voting history
(async () => {

  // get W3C Advisory Committee voting history file
  if(!fs.existsSync(votesFile)) {
    console.log(`Fetching W3C Advisory Committee voting history...`);
    const response = await axios.get('https://www.w3.org/2002/09/wbs/33280/all');
    const votesHtml = response.data;
    fs.writeFileSync(votesFile, votesHtml);
  }

  // get W3C Advisory Committee representative directory
  if(!fs.existsSync(acRepsFile)) {
    console.log(`Fetching W3C Advisory Committee representatives...`);
    const response = await axios.get('https://www.w3.org/Member/ACList');
    const acRepsHtml = response.data;
    fs.writeFileSync(acRepsFile, acRepsHtml);
  }

  // build AC Reps to Organization map
  const acRepsToOrganizationMap = {};
  const acRepsHtml = fs.readFileSync(acRepsFile, 'utf-8');
  const acRepsRegex = /<h2>([^<]*).*\n.*\n.*\n.*\n.*\n.*\n.*\n.*\n.*\n.*\n.*\n.*\n.*<h3 class="h5 card-title">\n\s*(.*)/g;
  const allAcReps =
    [...acRepsHtml.matchAll(acRepsRegex)];
  for(const acRep of allAcReps) {
    const acRepOrg = decode(acRep[1]).split(' - ')[0];
    const acRepName = decode(acRep[2]);
    acRepsToOrganizationMap[acRepName] = acRepOrg;
  }
  // bucket ex-AC Reps
  acRepsToOrganizationMap['David Singer'] = 'Apple, Inc.';

  // search every ballot result for ones that we are interested in
  const votesHtml = fs.readFileSync(votesFile, 'utf-8');
  const votesRegex = /href='(\S*)\/results'.*title='([^']*)'.*\n/g;
  const allVotes =
    [...votesHtml.matchAll(votesRegex)];
  for(const vote of allVotes) {
    const ballotName = vote[1];
    const ballotDescription = decode(vote[2]);
    const ballotRegex = /(call for review).*(charter|recommendation).*/i;
    // if the ballot was a charter or recommendation
    if(ballotRegex.test(ballotDescription)) {
      // retrieve each ballot result and store it to disk
      const ballotFile = path.join(resultsDir, ballotName + '.html');
      if(!fs.existsSync(ballotFile)) {
        const ballotUrl =
          `https://www.w3.org/2002/09/wbs/33280/${ballotName}/results`;
        console.log(`Fetching ballot history for ${ballotName}...`);
        const response = await axios.get(ballotUrl);
        const ballotHtml = response.data;
        fs.writeFileSync(ballotFile, ballotHtml);
      }
    }
  }

  // process every ballot result and tally statistics
  const memberTallies = {};
  let totalObjections = 0;
  fs.readdirSync(resultsDir).forEach(filename => {
    const ballotFile = path.join(resultsDir, filename);
    const ballotHtml = fs.readFileSync(ballotFile, 'utf-8');
    const votesRegex =
      /<tr><th scope='row'>([^<]*)<\/th>\n<td>([^<]*)<\/td>/g;
    const allVotes =
      [...ballotHtml.matchAll(votesRegex)];
    //console.log("ALL VOTES", allVotes.length);
    for(const vote of allVotes) {
      let member = vote[1].trim().replace(/ \(.*\)/g, '');
      const position = vote[2].replace(/[\r\n]|  /g, ' ').trim();

      // ignore bad matches against the regex
      if(member.includes('products') || position.length < 10 ||
        position.includes('Obsolete Recommendations')) {
        return;
      }

      // throw out erroneous parsing
      if(member.includes('<td>') || member.includes('\n')) {
        console.log(`Member name parsing error in ${filename}.`);
        console.log('DEBUG: MEMBER VALUE', member);
        return;
      }

      // map individual AC Reps to their corresponding organization
      if(member in acRepsToOrganizationMap) {
        member = acRepsToOrganizationMap[member];
      }

      // create the member statistics object
      if(memberTallies[member] === undefined) {
        memberTallies[member] = {
          support: 0,
          doesNotSupport: 0,
          abstain: 0,
          formalObjection: 0,
          unknown: 0
        };
      }

      // add the member position to the tally
      const supportRegex = /(supports *publication)|(supports this Charter)|(support[s]? the proposal)|(supports the proposed Charters)|(supports this Activity Proposal)|(supports republishing|(supports extending the charter))/g;
      if(position.includes('[Formal Objection]')) {
        memberTallies[member].formalObjection += 1;
        totalObjections += 1;
      } else if(position.includes('abstains') || position.includes('other')) {
        memberTallies[member].abstain += 1;
      } else if(position.includes('does not support')) {
        memberTallies[member].doesNotSupport += 1;
      }
      else if(supportRegex.test(position)) {
        memberTallies[member].support += 1;
      }
      else {
        console.log('DEBUG: UNKNOWN POSITION', member, position);
        memberTallies[member].unknown += 1;
      }
    }
  });

  // sort the member tallies by formal objections
  const sortedTallies = [];
  Object.keys(memberTallies).forEach(key => {
    sortedTallies.push({
      member: key,
      ...memberTallies[key]
    });
  });

  sortedTallies.sort((a, b) => {
    return b.formalObjection - a.formalObjection;
  });

  console.log(
    ''.padStart(40, ' '), '|',
    'Objection'.padStart(10, ' '), '|',
    'Total'.padStart(6, ' '), '|',
    'Objection'.padStart(9, ' '), '|\n',
    'W3C Member'.padStart(39, ' '), '|',
    'Count'.padStart(10, ' '), '|',
    'votes'.padStart(6, ' '), '|',
    'Percent'.padStart(9, ' '), '|');
  console.log('----------------------------------------------------------------------------');

  sortedTallies.forEach(item => {
    const totalVotes = item.formalObjection + item.abstain +
      item.doesNotSupport + item.support;
    const objectionPercentage =
      Math.floor((item.formalObjection / totalVotes) * 100);
    console.log(
      item.member.slice(0,39).padStart(40, ' '), '|',
      item.formalObjection.toString().padStart(10, ' '), '|',
      totalVotes.toString().padStart(6, ' '), '|',
      (objectionPercentage.toString() + '%').padStart(9, ' '), '|');
  });

  //console.log(sortedTallies);
  console.log('Total Voters:', sortedTallies.length);
  console.log('Total Objections:', totalObjections);

})();
