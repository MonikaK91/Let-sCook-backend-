import mongo from 'mongodb'
import connect from './db.mjs'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

//da jedan korisnik ne bi mogao imati više registracija 
//zbog toga kreiramo index na username
(async() => {
    let db = await connect()
    await db.collection("users").createIndex( {username: 1}, {unique: true})
})();

export default {
    //funkcija za registraciju
    //userData su podaci koji dolaze sa frontend-a
    async registerUser(userData) { 
        console.log(userData)
        //spajanje na bazu
        let db = await connect()

        let doc = {
            username: userData.username, //username spremamo onakvog kako ga je korisnik upisao
            password: await bcrypt.hash(userData.password, 8), //password spremamo pomoću hash da šifra korisnika bude kriptirana
        }
        try { //ako je sve prošlo u redu
            let result = await db.collection("users").insertOne(doc)
            console.log(result)
            if (result && result.insertedId) {
                return result.insertedId
            }
        } catch(e) { //ako već postoji korisnik
            if (e.code == 11000) {
                throw new Error("Korisnik već postoji")
            }
        }
    },
    //funkcija za autentifikaciju
    async authenticateUser(username, password) {
        //spajanje na bazu
        let db = await connect()
        //sa findOne tražimo dokument po atributu username i to prema username-u kojeg smo dobili
        let user = await db.collection("users").findOne({username: username})

        //ako postoji dokument, ako ima password i ako je password u bazi isti kao upisani password
        //bcrypt.compare uspoređuje lozinke
        if(user && user.password && (await bcrypt.compare(password, user.password))) {
            delete user.password
            let token = jwt.sign(user, process.env.JWT_SECRET, {
                algorithm: "HS512",
                expiresIn: "1 week" //trajanje tokena
            })
            return {
                token,
                username: user.username
            }
        }
        else {
            throw new Error("Cannot authenticate")
        }
    },
    //metoda za promjenu lozinke
    async changeUserPassword(username, old_password, new_password) {
        //spajanje na bazu
        let db = await connect();
        //tražimo da li taj korisnik postoji u bazi "users"
        let user = await db.collection("users").findOne({username: username})
        //ako taj korisnik postoji, ima definiranu lozinku, te se vrši provjera da li je stara lozinka koju je on poslao ista kao lozinka u bazi
        if(user && user.password && (await bcrypt.compare(old_password, user.password))) {
            //spremamo novu lozinku (isto spremamo kriptiranu)
            let new_password_hashed = await bcrypt.hash(new_password, 8)
            //mijenjamo jedan zapis
            let result = await db.collection("users").updateOne(
                {_id: user._id}, //id korisnika iz baze
                { $set: {password: new_password_hashed}} //mijenjanje lozinke
            )
            return result.modifiedCount == 1
        }
    },
    //provjera tokena
    //next koristimo jer middleware funkcija može biti više, te mora pozvati next da bi se ostatak funkcije ispunio
    verify(req, res, next) { 
        try {
        //izvlačimo token (ili potpis?)
        let authorization = req.headers.authorization.split(' ')
        let type = authorization[0] //tip tokena
        let token = authorization[1] //token
        if (type !== "Bearer") { //ako nije Bearer token
            return res.status(401).send()
        }
        else { //primamo samo Bearer tokene
            //jwt.verify provjerava potpis
            //nakon dekodiranja tokena spremamo te podatke uz request
            req.jwt = jwt.verify(token, process.env.JWT_SECRET)
            return next()
        }
    } catch(e) {
        return res.status(401).send()
    }
    }
}