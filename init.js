const config = require('./config.js');
const Influx = require('influx')
const bitcoin = require("bitcoin");


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

    ]
});



influx.getDatabaseNames()
    .then(names => {
        if (!names.includes(config.influx_db)) {
            influx.createDatabase(config.influx_db).then( () => {;
            influx.createRetentionPolicy('db_retention', {
                duration: config.period + "s",
                replication: 2,
                database: config.influx_db,
                isDefault: true
            });
        });
        }
        if (!names.includes(config.influx_nodes_db)) {
            influx.createDatabase(config.influx_nodes_db).then( () => {
            influx.createRetentionPolicy('nodesdb_default_retention',{
                duration: config.nodes_duration,
                replication: 2,
                database: config.influx_nodes_db,
                isDefault: true
            });
            influx.createRetentionPolicy('1y',{
                duration: "365d",
                replication: 1,
                database: config.influx_nodes_db,
            }).then( () => {
            influx.createContinuousQuery('nodesdb_continuous', `
            SELECT COUNT(address) INTO "1y"."nodes"
            FROM "nodes" GROUP BY time(` + config.nodes_duration + `)`, config.influx_nodes_db);
        })
    })
}
    })
    .then(() => {
        http.createServer(app).listen(3000, function () {
            console.log('Listening on port 3000')
        })
    })
    .catch(err => {
        console.error(`Error creating Influx database!`);
    });

today = new Date();
endpoint = (today.getTime() / 1000) - config.period;

client.getBlockchainInfo(function (err, info) {
    console.log(info);
});

if (process.argv[2] == "reset") {
    console.log("Deleting old Measurements");
    influx.query("DROP MEASUREMENT blocks").then(results => {
        influx.query("DROP MEASUREMENT events").then(results => {
            getBestBlock();
        });
    });
} else {
    console.log("Continuing");
    getBestBlock();
}

function getBestBlock() {
    client.getBestBlockHash(function (err, info) {
        console.log("Latest Block: " + info);
        if (process.argv[2] == "reset") {
            console.log("Searching oldest Block");
        } else {
            console.log("Searching latest indexed Block");
        }
        findLastBlock(info);
    });
}

function findLastBlock(hash) {
    client.getBlock(hash, function (err, blockinfo) {
        console.log("Checking: " + blockinfo.height);
        if (blockinfo.mediantime > endpoint) {
            if (process.argv[2] != "reset") {
                influx.query("SHOW SERIES FROM blocks WHERE height='" + blockinfo.height + "'").then(results => {
                    if (results.length !== 0) {
                        console.log("Reached oldest indexed block");
                        if (blockinfo.nextblockhash) {
                            insertBlock(blockinfo.nextblockhash, blockinfo.time);
                        } else {
                            console.log("Blockchain already indexed");
                        }
                    } else {
                        findLastBlock(blockinfo.previousblockhash);
                    }
                });
            } else {
                findLastBlock(blockinfo.previousblockhash);
            }
        } else {
            console.log("Reached oldest Block");
            insertBlock(blockinfo.hash);
        }
    });
}

function insertBlock(hash, previousblocktime) {
    client.getBlock(hash, function (err, blockinfo) {
        console.log("Inserting: " + blockinfo.height);
        timetolastblock = 0
        if (previousblocktime) {
            timetolastblock = blockinfo.time - previousblocktime;
        }
        influx.writeMeasurement('blocks', [
            {
                tags: { height: blockinfo.height },
                fields: { hash: blockinfo.hash, size: blockinfo.size, weight: blockinfo.weight, difficulty: blockinfo.difficulty, tbb: timetolastblock, txcount: blockinfo.tx.length },
                timestamp: blockinfo.time  * 1000000000
            }
        ]).catch(err => {
            console.error('Error saving data to InfluxDB! ${err.stack}')
        });
        if (blockinfo.nextblockhash) {
            insertBlock(blockinfo.nextblockhash, blockinfo.time);
        } else {
            console.log("Blockchain indexed");
        }
    });
}