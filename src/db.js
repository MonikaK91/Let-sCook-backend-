import mongo from 'mongodb'

let connection_string = 'mongodb+srv://admin:admin@cluster0.dnzl8fu.mongodb.net/?retryWrites=true&w=majority';

//naknadno dodano jer je bacalo grešku da MongoClient nije definiran
let MongoClient = require('mongodb').MongoClient

//instanciranje mongo client-a
//to je js objekt koji služi za pristup prema bazi na navedenom connection stringu
let client = new MongoClient(connection_string, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}) 

//da bi mogli koristiti bazu
let db = null

//exportamo Promise koji resolva na konekciju
export default () => {
    return new Promise((resolve, reject) => {
        //ako smo inicijalizirali bazu i klijent je još uvijek spojen
        ////makla sam da je isConnected funkcija jer je bacalo grešku
        if (db && client.isConnected) {
            resolve(db)
        }
        client.connect(err => {
            if(err) {
                reject("Došlo je do greške: " + err)
            }
            else {
                console.log("Uspješno spajanje na bazu")
                db = client.db("let'sCook")
                resolve(db)
            }
        })
    })
}