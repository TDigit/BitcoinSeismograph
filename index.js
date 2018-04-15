var config = require('./config.js');
var Influx = require('influx')
var bitcoin = require("bitcoin");
var fs = require("fs");
var wsServer = require("./frontend/server.js");
var nodeCrawler = require("./node_crawler/crawler2.js");
var WebSocketServer = require('ws').Server;

console.log(config.blockchaindir);

var client = new bitcoin.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    pass: config.pass,
    timeout: config.timeout
});

const influx = new Influx.InfluxDB({
    host: 'localhost',
    database: config.influx_db,
    schema: [
        {
            measurement: 'blocks',
            fields: {
                hash: Influx.FieldType.STRING,
                size: Influx.FieldType.INTEGER,
                weight: Influx.FieldType.INTEGER,
                difficulty: Influx.FieldType.FLOAT,
                tbb: Influx.FieldType.INTEGER,
                txcount: Influx.FieldType.INTEGER
            },
            tags: [
                'height'
            ]
        },
        {
            measurement: 'events',
            fields: {
                identifier: Influx.FieldType.STRING,
                description: Influx.FieldType.STRING,
            },
            tags: [
                'type'
            ]
        },

    ]
});

const influx_nodes = new Influx.InfluxDB({
    host: 'localhost',
    database: config.influx_nodes_db,
    schema: [
        {
            measurement: 'nodes',
            fields: {
                version: Influx.FieldType.STRING,
                height: Influx.FieldType.INTEGER,
                hash0: Influx.FieldType.STRING,
                hash1: Influx.FieldType.STRING,
                hash2: Influx.FieldType.STRING,
                hash3: Influx.FieldType.STRING,
                hash4: Influx.FieldType.STRING,
                hash5: Influx.FieldType.STRING,
                hash6: Influx.FieldType.STRING,
                hash7: Influx.FieldType.STRING,
                hash8: Influx.FieldType.STRING,
                hash9: Influx.FieldType.STRING
            },
            tags: [
                'address',
                'useragent'
            ]
        },

    ]
});

checkNodes ();

console.log("Starting Blockchainapi Deamon");

client.getBlockchainInfo(function (err, info) {
    console.log(info);
});

fs.watch(config.blockchaindir + "/blocks", function (event, filename) {
    console.log("Blockchain changed");
    client.getBestBlockHash(function (err, hash) {
        console.log("Latest Block: " + hash);
        console.log("Searching oldest unchanged block");
        checkTransactions(hash);
        findOldestBlock(hash);
    });

});

var requestCount = 0;
var requestCountTransaction = 0;
var limiter = false;

var checkingNodes = false;

function findOldestBlock(hash) {
    client.getBlock(hash, function (err, blockinfo) {
        if (blockinfo != undefined) {
            console.log("Checking: " + blockinfo.height);
            influx.query("SELECT hash FROM blocks WHERE height='" + blockinfo.height + "'").then(rows => {
                if (rows.length !== 0) {
                    if (hash == rows[0].hash) {
                        console.log("Found latest indexed block of this fork");
                        console.log("Inserting new blocks")
                        insertBlock(blockinfo.nextblockhash, blockinfo.time);
                    } else {
                        findOldestBlock(blockinfo.previousblockhash);
                    }
                } else {
                    findOldestBlock(blockinfo.previousblockhash);
                }
            });
        } else {
            if (requestCount < 5) {
                console.log("Block not found");
                requestCount++;
                findOldestBlock(hash);
            } else {
                console.log("Aborting");
                requestCount = 0;
            }
        }
    });
}

function insertBlock(hash, previousblocktime) {
    client.getBlock(hash, function (err, blockinfo) {
        if (blockinfo != undefined) {
            console.log("Inserting: " + blockinfo.height);
            timetolastblock = 0
            if (previousblocktime) {
                timetolastblock = blockinfo.time - previousblocktime;
            }
            influx.writeMeasurement('blocks', [
                {
                    tags: { height: blockinfo.height },
                    fields: { hash: blockinfo.hash, size: blockinfo.size, weight: blockinfo.weight, difficulty: blockinfo.difficulty, tbb: timetolastblock, txcount: blockinfo.tx.length },
                    timestamp: blockinfo.time * 1000000000
                }
            ]).then(elem => {
                if (!limiter) {
                    sendBlockData();
                    limiter = true;
                    setTimeout(function () {
                        limiter = false;
                    }, 60000);
                }
            }).catch(err => {
                console.error('Error saving data to InfluxDB! ${err.stack}')
            });
            if (blockinfo.nextblockhash) {
                insertBlock(blockinfo.nextblockhash, blockinfo.time);
            } else {
                console.log("Blockchain indexed");
                if (!checkingNodes){
                    setTimeout(function () {
                        checkNodes ();
                    }, 40000);
                    checkingNodes = true;
                }
            }
        } else {
            if (requestCount < 5) {
                console.log("Block not found");
                requestCount++;
                insertBlock(hash, previousblocktime);
            } else {
                console.log("Aborting");
                requestCount = 0;
            }
        }
    });
}

function checkTransactions(hash) {
    client.getBlock(hash, function (err, blockinfo) {
        if (blockinfo) {
            console.log("Checking for events");
            checkTransaction(blockinfo.tx, []);
        } else {
            if (requestCountTransaction < 5) {
                console.log("Transaction not found");
                requestCountTransaction++;
                checkTransactions(hash);
            } else {
                console.log("Aborting");
                requestCountTransaction = 0;
            }
        }
    });
}

function checkTransaction(txids) {
    client.getRawTransaction(txids[0], true, function (err, transaction) {
        var totalValue = 0;
        if (transaction) {
            requestCountTransaction = 0;
            transaction.vout.forEach((vout) => {
                totalValue += vout.value;
            });
            if (totalValue > config.txAlertLimit) {
                console.log("Adding TX Event");
                influx.query("DROP SERIES FROM events WHERE identifier='" + transaction.txid ).then(results => {
                    influx.writeMeasurement('events', [
                        {
                            tags: { type: "value" },
                            fields: { identifier: transaction.txid, description: "bigger than " + config.txAlertLimit + " BTC"},
                            timestamp: transaction.time * 1000000000
                        }
                    ]);
                });
            }
            txids.shift();
            if (txids.length > 0) {
                checkTransaction(txids);
            } else {
                console.log("Checked for Events");
                sendEventData();
            }
        } else {
            if (requestCountTransaction < 5) {
                console.log("Transaction not found");
                requestCountTransaction++;
                checkTransaction(txids);
            } else {
                console.log("Transaction not found");
                requestCountTransaction = 0;
                txids.shift();
                checkTransaction(txids);
            }
        }
    });
}

function checkNodes (){
    nodeCrawler.crawlNodes((nodeHeights) => { 
        console.log("checking for Forks");
        var mainForkHeight = "";
        var mainForkCount = 0;
        for (var key in nodeHeights) {
            if (nodeHeights[key].count > mainForkCount){
                mainForkHeight = key;
                mainForkCount = nodeHeights[key].count;
            }
        }
        for (var key in nodeHeights) {
            if (key != mainForkHeight){
                heightDiff = parseInt(mainForkHeight) - parseInt(key)
                if ((heightDiff < -config.forkHeightDiff) || (heightDiff > config.forkHeightDiff)){
                    console.log("Adding Fork Event");
                    influx.writeMeasurement('events', [
                        {
                            tags: { type: "fork" },
                            fields: { identifier: mainForkHeight + "/" + key, description: "Fork Possible: Height Difference of more than " + config.forkHeightDiff + " detected! (" + JSON.stringify(nodeHeights[key].userAgents) + ")"},
                        }
                    ]);
                }
            }
        }
        checkNodes = false;
    
        sendEventData();
        sendNodeData();
    
    });
}
    
    sendBlockData = function () {
        console.log("Sending Block Data");
        influx.query("SELECT * FROM blocks GROUP BY height ORDER BY time DESC limit 1").then(rows => {
            wsConnection.send(JSON.stringify({
                datatype: "block",
                payload: rows
            }), function () { /* ignore errors */ });
        });
  
}

sendEventData = function () {
    console.log("Sending Event Data");
    influx.query("SELECT * FROM events ORDER BY time DESC limit 10").then(rows => {
        wsConnection.send(JSON.stringify({
            datatype: "event",
            payload: rows
        }), function () { /* ignore errors */ });
    });
}

sendNodeData = function () {
    console.log("Sending Node Data");
    influx_nodes.query("Select Count(version) from nodes group by useragent").then(rows => {
        wsConnection.send(JSON.stringify({
            datatype: "node",
            payload: rows
        }), function () { /* ignore errors */ });
    });
}