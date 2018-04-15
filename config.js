const config = {};

config.blockchaindir = "E:/Bitcoin-Blockchain/"; //Blockchain Directory
config.influx_db = "blockchainapi"; //Standard Databse
config.period = 95920; //s The Time Period of Blocks that will be added.
//Bitcoin Node Config
config.host = 'localhost';
config.port = 8332;
config.user = 'username';
config.pass = 'password';
config.timeout = 30000;
//Node Crawler
config.influx_nodes_db = "btcnodes"; //Network-Nodes Database
config.nodes_duration = "7d" //duration units = "u" | "µ" | "ms" | "s" | "m" | "h" | "d" | "w"
config.node_crawling_rate = 200 //ms Pause between each new Request
//UTXO Scraper
config.mongodbUrl = 'mongodb://localhost:27017/blockchainapi'; //Standard Mongodb Database
config.utxoStartHeight = 0; //UTXO scraping start height
//Events
config.txAlertLimit = 500 //BTC Transactions above this threshold will be reported
config.forkHeightDiff = 5 //Forks with a height difference above this will be reported

module.exports = config;