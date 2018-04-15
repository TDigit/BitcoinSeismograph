# BitcoinDataAPI

This is a data scraper for Bitcoin. The data is directly culled of a local Bitcoin node.
Currently the data scraper is not integrated with the other parts of the Bitcoin Seismograph.

### Installation
1. Install influxDB
2. Install bitcoin-core
3. Start bitcoind as a server `bitcoind -server` and activate pruning if necessary `-prune=<n>`
4. Start influxd
5. Install the dependencies `npm install`
6. Edit the config.js and set your parameters
7. Run the init.js `node init.js`
8. Start the API `npm start`
