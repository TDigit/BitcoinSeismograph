var PeerGroup = require('bitcoin-net').PeerGroup;
var Peer = require('bitcoin-net').PeerGroup;
var _ = require('underscore');
var config = require('../config.js');
var Influx = require('influx');
const crypto = require('crypto');
var bitcoin = require("bitcoin");

var addresses = [];
var crawledCounter = 0;

addresses[0] = { address: '127.0.0.1', port: 8333 };

//Github-Source
//Source:  snogcel/bcoin-dash/lib/bcoin/utils.js
function revHex(s) {
    var r = '';
    var i = 0;

    for (; i < s.length; i += 2)
        r = s.slice(i, i + 2) + r;

    return r;
};
//END Source

//Stackoverflow Source
//Source: https://stackoverflow.com/questions/15761790/convert-a-32bit-integer-into-4-bytes-of-data-in-javascript
//Bechir and Aadit M Shah
function hex32(val) {
    val &= 0xFFFFFFFF;
    var hex = val.toString(16).toUpperCase();
    return revHex(("00000000" + hex).slice(-8));
}
//END Source

//Stackoverflow Source
//Source: https://stackoverflow.com/questions/57803/how-to-convert-decimal-to-hex-in-javascript
//Luke Smith
function decimalToHex(d, padding) {
    var hex = Number(d).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return revHex(hex);
}
//END Source

process.on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    if (err.code == "ECONNRESET") {
    } else {
        process.exit(1);
    }
});

var client = new bitcoin.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    pass: config.pass,
    timeout: config.timeout
});


const influx = new Influx.InfluxDB({
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

var locatorBlockHash;

function getAddrFromNode(address, port) {
    // console.log("Trying to connect to: " + address + ":" + port);
    try {
        let peer = new Peer({
            magic: 0xd9b4bef9,
            defaultPort: port,
            staticPeers: [
                address
            ]
        });
        let connected = false;
        setTimeout(function () {
            if (!connected) {
                // console.log("Node doesn't react Timeout: " + address);
                delete this.peer;
                return;
            }
        }, 5000);
        peer.once('peer', (peer) => {
            console.log('connected to peer', peer.socket.remoteAddress);
            connected = true;
            //console.log(JSON.stringify(peer.version));
            let hash = new Buffer(revHex(locatorBlockHash), 'hex');
            let hashs = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
            influx.query("DROP SERIES FROM nodes WHERE address='" + address + "'").then(results => {
                console.log("Old record cleared");
                console.log(peer.version.userAgent)
                influx.writeMeasurement('nodes', [
                    {
                        tags: { address: address,
                            useragent: peer.version.userAgent },
                        fields: {
                            version: peer.version.version,
                            height: peer.version.startHeight,
                            hash0: hashs[0],
                            hash1: hashs[1],
                            hash2: hashs[2],
                            hash3: hashs[3],
                            hash4: hashs[4],
                            hash5: hashs[5],
                            hash6: hashs[6],
                            hash7: hashs[7],
                            hash8: hashs[8],
                            hash9: hashs[9]
                        }
                    }
                ]).then(elem => {
                    console.log("Node written to Database")
                }).catch(err => {
                    console.error('Error saving data to InfluxDB! ' + err)
                });
            });
            peer.getHeaders([hash], (err, headers) => {
                if (headers) {
                    headers.reverse();
                    headers.forEach((header, index) => {
                        headerhex = hex32(header.version) + header.prevHash.toString("hex") + header.merkleRoot.toString("hex") + hex32(header.timestamp) + hex32(header.bits) + decimalToHex(header.nonce, 8);
                        const hash = crypto.createHash('sha256');
                        const hash2 = crypto.createHash('sha256');
                        hash.update(headerhex, "hex");
                        hash2.update(hash.digest());
                        hashs[index] = revHex(hash2.digest("hex"));
                    });
                    influx.query("DROP SERIES FROM nodes WHERE address='" + address + "'").then(results => {
                        console.log("Old record cleared");
                        console.log(peer.version.userAgent)
                        influx.writeMeasurement('nodes', [
                            {
                                tags: { address: address,
                                    useragent: peer.version.userAgent },
                                fields: {
                                    version: peer.version.version,
                                    height: peer.version.startHeight,
                                    hash0: hashs[0],
                                    hash1: hashs[1],
                                    hash2: hashs[2],
                                    hash3: hashs[3],
                                    hash4: hashs[4],
                                    hash5: hashs[5],
                                    hash6: hashs[6],
                                    hash7: hashs[7],
                                    hash8: hashs[8],
                                    hash9: hashs[9]
                                }
                            }
                        ]).then(elem => {
                            console.log("Node written to Database")
                        }).catch(err => {
                            console.error('Error saving data to InfluxDB! ' + err)
                        });
                    });
                } else {
                    console.log("No Headers transmitted")
                }
            });
            peer.on('addr', (addr) => {
                if (addr.length > 1) { //Nodes schicken idR nur ihre eigene Adresse einzeln, trotzdem evtl ändern.
                    addr.forEach(function (element) {
                        //console.log(element.address + ":" + element.port);
                        addressObject = { address: element.address, port: element.port };
                        if (_.findWhere(addresses, addressObject) == undefined) {
                            addresses.push(addressObject);
                            //console.log("Address Count: " + addresses.length);
                            //getAddrFromNode(element.address, element.port);
                        } else {
                            //console.log("----------------------Adress already known----------------------")
                        }
                    });

                    console.log("Address Count: " + addresses.length);

                    // console.log("Disconnecting");
                    try {
                        peer.disconnect(0);
                    } catch (err) {
                        console.log(err);
                    }
                }
            });
            peer.send("getaddr");
            setTimeout(function () {
                // console.log("Disconnecting");
                try {
                    peer.disconnect(0);
                } catch (err) {
                    console.log(err);
                }
            }, 60000);
        })

        peer.on("disconnect", disconnectEvent);

        function disconnectEvent(event) {
            // console.log("Disconnected: " + address);
            peer.removeListener("disconnect", disconnectEvent);
            delete this.peer;
            return;
        }

        try {
            peer.connect();
        } catch (err) {
            console.log(err);
            console.log("Connection Error: " + address);
            delete this.peer;
            return;
        }
    } catch (err) {
        console.log(err);
        console.log("Peer Data Error: " + address);
        delete this.peer;
        return;
    }
}

client.getBlockCount(function (err, height) {
    client.getBlockHash(height - 10, function (err, hash) {
        locatorBlockHash = hash;
        setInterval(function () {
            if (process.memoryUsage().heapUsed < 419430400) {
                crawledCounter++;
                if ((addresses[crawledCounter] != null)) {
                    //console.log("Connecting to next Node");
                    //console.log("Already indexed Nodes: " + crawledCounter)
                    getAddrFromNode(addresses[crawledCounter].address, addresses[crawledCounter].port);
                } else {
                    crawledCounter--;
                    console.log("All Addresses checked")
                }
            } else {
                console.log("Memory Usage too high!");
            }
        }, config.node_crawling_rate);
        getAddrFromNode(addresses[crawledCounter].address, addresses[crawledCounter].port);
    });
});

