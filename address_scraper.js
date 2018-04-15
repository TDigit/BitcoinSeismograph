var bitcoin = require("bitcoin");
var MongoClient = require('mongodb').MongoClient
    , assert = require('assert');
var config = require('./config.js');

// Connection URL
var url = 'mongodb://localhost:27017/blockchainapi';
var startHeight = 0;

var client = new bitcoin.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    pass: config.pass,
    timeout: config.timeout
});

// Use connect method to connect to the server
MongoClient.connect(url, function (err, db) {
    assert.equal(null, err);
    console.log("Connected successfully to server");
    client.getBlockchainInfo(function (err, info) {
        console.log(info);
        startHeight = info.headers;
        client.getBlockHash(0, function (err, blockhash) {
            addTransactions(blockhash, db);
        });
    });
});

var tx = [];
var oldTx = [];

function addTransactions(blockhash, db) {
    //console.log(blockhash);
    client.getBlock(blockhash, function (err, block) {
        if (block) {
            console.log(block.height);
            addUTXO(block.tx, 0, db, block);
        } else {
            console.log("Block not found");
            addTransactions(blockhash, db, block);
        }

    });
}

function addUTXO(txids, timeoutCounter, db, block) {
    //console.log(txids[0]);
    client.getRawTransaction(txids[0], true, function (err, transaction) {
        if (transaction) {
            //console.log(transaction.txid);
            if (block.height >= startHeight) {
                transaction.vin.forEach(vin => {
                    oldTx.push({ txid: vin.txid });
                });
            }
            transaction.vout.forEach(vout => {
                //console.log(vout.value);
                //console.log(vout.scriptPubKey);
                if (vout.scriptPubKey.addresses) {
                    tx.push({ txid: txids[0], value: vout.value, address: vout.scriptPubKey.addresses });
                }

            });
            if (timeoutCounter == 0) {
                txids.shift();
                if (txids.length > 0) {
                    addUTXO(txids, 0, db, block);
                } else {
                    insertUTXO(db, block);
                }
            }
        } else {
            //console.log(JSON.stringify(err))
            //console.log("Transaction not found");
            if (timeoutCounter == 0) {
                txids.shift();
                if (txids.length > 0) {
                    addUTXO(txids, 0, db, block);
                } else {
                    insertUTXO(db, block);
                }
            }
            if (timeoutCounter < 5) {
                setTimeout(function () {
                    timeoutCounter++;
                    addUTXO(txids, timeoutCounter, db, block);
                }, 1000);
            }

        }
    });
}

function insertUTXO(db, block) {
    //console.log("reached last tx");
    if (tx.length > 0) {
        console.log("adding " + tx.length + " transactions");
        insertDocuments(db, "transactions", tx, function (err) {
            if (err) {
                if (err.result) {
                    //console.log("transaction added")
                } else {
                    console.log(err);
                }
            }
        });
        tx.forEach((transaction) => {
            transaction.address.forEach((address) => {
                db.collection("wallets").update({ address: transaction.address },
                    {
                        $inc: { value: transaction.value },
                        $setOnInsert: {
                            address: address,
                        }
                    },
                    {
                        upsert: true
                    }, function (err, document) {
                        //console.log("Wallet updated");
                    });

            });
        });
        if (oldTx.length > 0) {
            console.log("removing " + oldTx.length + " transactions")
            oldTx.forEach((transaction) => {
                db.collection("transactions").findOne({ address: transaction.txid }, function (err, result) {
                    if (!err) {
                        result.address.forEach((address) => {
                            db.collection("wallets").update({ address: transaction.address },
                                {
                                    $inc: { value: -result.value },
                                }, function (err, document) {
                                    db.collection("transactions").deleteOne({ address: transaction.txid }, function(err, obj) {
                                        if (!err) {
                                        console.log("old UTXO deleted");
                                        }
                                      });
                                });
                        });
                    }
                });
            })
        }
    }
    if (block.nextblockhash) {
        tx = [];
        oldTx = [];
        addTransactions(block.nextblockhash, db);
    } else {
        console.log("All UTXO indexed");
        db.close();
    }

}



//mongoDB wiki
var insertDocuments = function (db, collection, documents, callback) {
    // Get the documents collection
    var collection = db.collection(collection);
    // Insert some documents
    collection.insertMany(documents, function (err, result) {
        callback(result);
    });
}

var findDocuments = function (db, collection, callback) {
    // Get the documents collection
    var collection = db.collection(collection);
    // Find some documents
    collection.find({}).toArray(function (err, docs) {
        assert.equal(err, null);
        console.log("Found the following records");
        console.log(docs)
        callback(docs);
    });
}

var removeDocuments = function (db, collection, documents, callback) {
    // Get the documents collection
    var collection = db.collection(collection);
    // Delete document where a is 3
    collection.deleteMany(documents, function (err, result) {
        callback(result);
    });
}
//mongoDB wiki