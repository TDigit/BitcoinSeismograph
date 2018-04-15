var MongoClient = require('mongodb').MongoClient
    , assert = require('assert');
var fs = require('fs');

// Connection URL
var url = 'mongodb://localhost:27017/blockchainapi';

/* var addressBalancesFile = fs.readFileSync("address-balances.json");
var addressBalances = JSON.parse(addressBalancesFile);

console.log(addressBalances.length); */

// Use connect method to connect to the server
MongoClient.connect(url, function (err, db) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    aggregateDocuments(db, "transactions", [
/*                { $match : { $or : [
                    { address : "1KKK1BN2rWjVZXMWCWZr3Pft8e8EpyHFpa" },
                    { address : "1HxEER65mktmKUQiDgdd8Q73VChEphLdXT"}
                ]} },   */
        { $unwind: "$address" },
        { $group: { _id: "$address", balance: { $sum: "$value" } } },
        {
            $project: {
                _id: 0,
                address: "$_id",
                balance: 1
            }
        }
    ], function (result) {

        console.log("Received Results, Writing to File");
        db.close();
        fs.writeFile("./address-balances.json", JSON.stringify(result), function (err) {
            if (err) {
                return console.log(err);
            }

            console.log("The file was saved!");
        });


    });

});

var aggregateDocuments = function (db, collection, aggregation, callback) {
    // Get the documents collection
    var collection = db.collection(collection);
    // Find some documents
    collection.aggregate(aggregation, {
        allowDiskUse: true,
        cursor: {}
    }).toArray(function (err, docs) {
        assert.equal(err, null);
        callback(docs);
    });
}
