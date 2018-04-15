var config = require('../config.js');
var Influx = require('influx');
var PeerGroup = require('bitcoin-net').PeerGroup

var peers = new PeerGroup({
    magic: 0xd9b4bef9,
    defaultPort: 8333,
    dnsSeeds: [
        'seed.bitcoin.sipa.be',
        'dnsseed.bluematt.me',
        'dnsseed.bitcoin.dashjr.org',
        'seed.bitcoinstats.com',
        'seed.bitnodes.io',
        'bitseed.xf2.org',
        'seed.bitcoin.jonasschnelli.ch',
        'seed.btc.petertodd.org'
    ].sort(() => Math.random() - 0.5)
}, { numPeers: 30 });


const influx = new Influx.InfluxDB({
    host: 'localhost',
    database: config.influx_nodes_db,
    schema: [
        {
            measurement: 'nodes',
            fields: {
                version: Influx.FieldType.STRING,
                height: Influx.FieldType.INTEGER,
            },
            tags: [
                'address',
                'useragent'
            ]
        },

    ]
});

var heightList;

peers.on('peer', (peer) => {
    //console.log('connected to peer', peer.socket.remoteAddress)
    var thisUserAgent = peer.version.userAgent;
    var thisAddress = peer.socket.remoteAddress;
    var thisStartHeight = peer.version.startHeight;

    console.log(thisUserAgent);
    console.log(thisStartHeight);

    if (!heightList[thisStartHeight]) {
        heightList[thisStartHeight] = { count: 1, userAgents: [{ userAgent: thisUserAgent, IPs: [thisAddress] }] };
    } else {
        heightList[thisStartHeight].count++;
        indexOfUA = heightList[thisStartHeight].userAgents.findIndex((elem) => {
            return elem.userAgent == thisUserAgent;
        });
        if (indexOfUA == -1) {
            heightList[thisStartHeight].userAgents.push({ userAgent: thisUserAgent, IPs: [thisAddress] });
        } else {
            heightList[thisStartHeight].userAgents[indexOfUA].IPs.push(thisAddress);
        }
    }

    influx.query("DROP SERIES FROM nodes WHERE address='" + thisAddress + "'").then(results => {
        influx.writeMeasurement('nodes', [
            {
                tags: {
                    address: thisAddress,
                    useragent: thisUserAgent
                },
                fields: {
                    version: peer.version.version,
                    height: thisStartHeight,
                }
            }
        ]).then(elem => {
        }).catch(err => {
            console.error('Error saving data to InfluxDB! ' + err)
        });
    });

})

var exports = module.exports = {};

exports.crawlNodes = function(cb) {
    heightList = {};
    peers.connect();
    
    setTimeout(function () {
        peers.close((err) => {
            console.log("all Peers disconnected");
            cb(heightList);
        })
    }, 60000);
}
