# W3C Formal Objection Statistics Tool

***WARNING: The output of this tool is W3C AC Member Confidential. Do not
share or upload the results anywhere outside of this group. Doing so would be
a breach of W3C Member Confidentiality.***

This tool calculates a number of interesting statistics related to how
often W3C Member companies vote and how often they object to W3C Charters
and W3C Proposed Recommendations.

The tool works by downloading the entire W3C Advisory Committee voting history
and then calculating how companies vote on the ballots. Statistics are
gathered on how many times companies vote, whether they're supportive, abstain,
or formally object to the work at W3C. These statistics are then tallied and
displayed in a human-readable form showing a sorted table of each company
by the number of times they objected, the number of times they voted, and
the statistical chance they have of objecting to any particular ballot.

To run the tool, you must have access to the W3C Advisory Committee ballot
results.

To install, do the following (with node.js 14+):

```
npm i
node index.js
```

The tool will request your W3C username and password. Check the code to make
sure it's not doing something nefarious with your username and password
before you type it in. The code just uses those values to do HTTP Basic
authentication with W3C to access the ballots.

The tool will then download all of the ballots it has access to and then
use those ballots to tally the results. Repeated runs of the tool uses
cached copies of the ballots stored in the `./tmp` directory. If the tool
works, you should see a tallied set of results at the end.
