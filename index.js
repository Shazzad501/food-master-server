require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middle weres
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wlddb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const usersCollection = client.db("foodMasterDB").collection('users');
    const menuCollection = client.db("foodMasterDB").collection('menu');
    const reviewCollection = client.db("foodMasterDB").collection('review');
    const cartCollection = client.db("foodMasterDB").collection('cart');
    const paymentCollection = client.db("foodMasterDB").collection('payments');


    // jwt token related api
    app.post('/jwt', async(req, res)=>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '2h'});
      res.send({token})
    })

    // verify jwt token
    const verifyToken = (req, res, next)=>{
      // console.log('Inside verify token',req.headers.authorization)
      if(!req.headers.authorization){
        return res.status(401).send({message: 'Unauthorized Access'})
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'Unauthorized Access'})
        }
        req.decoded = decoded;
        next()
      })
      // next()
    }

    // verify admin token 
    const verifyAdmin = async(req, res, next)=>{
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'Forbidden Accesss'})
      }
      next();
    }

    // user related api 
    // user info post api
    app.post('/users', async(req, res)=>{
      const user = req.body;
      // save user if user doesn't existed
      const query = {email: user.email}
      const exitedUser = await usersCollection.findOne(query)
      if(exitedUser){
        return res.send({message: 'user all ready save.', insertedId: null})
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })
    
    // user data update api or make a user in admin
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const updatedDoc={
        $set:{
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // get a user by check is admin
    app.get('/users/admin/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'Forbidden Access'})
      }
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({admin})

    })

    // get all user
    app.get('/users', verifyToken, verifyAdmin, async(req, res)=>{
      const result = await usersCollection.find().toArray()
      res.send(result);
    })

    // delete a user by id
    app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    // post a menu item into db
    app.post('/menu',verifyToken, verifyAdmin, async(req, res)=>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    })

    // get all menu into db
    app.get('/menu', async(req, res)=>{
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // update a menu item with get by id
    app.patch('/menu/:id',verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const item = req.body;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set:{
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // delete a menu item with get by id
    app.delete('/menu/:id',verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await menuCollection.deleteOne(filter);
      res.send(result);
    })

    // get all reviews into the db
    app.get('/review', async(req, res)=>{
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // post a cart into the db
    app.post('/carts', async(req, res)=>{
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    })
    // get all cart into the db
    app.get('/carts', async(req, res)=>{
      const email = req.query.email;
      const query = {userEmail: email}
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    // delete a cart with id
    app.delete('/carts/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    })

    // paymet related api
    app.post('/create-payment-intent', async(req, res)=>{
      const {price} = req.body;
      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // save payment in db
    app.post('/payments', async(req, res)=>{
      const payment = req.body;
      const paymetResult = await paymentCollection.insertOne(payment);

      // now carefully delete data into the cartcollection
      const query= {_id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }};
      const deleteResult= await cartCollection.deleteMany(query);
      res.send({paymetResult, deleteResult});
    })

    // get all paymet get by user email
    app.get('/payments/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      const query = {email : email}
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'Forbidden Access'})
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    })

    // admin stats api
    app.get('/admin-stats',verifyToken, verifyAdmin, async(req, res)=>{
      const users = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // this not the best way to the get revinew
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0)

      // this is better way
      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue:{
              $sum: '$price'
            }
          }
        }
      ]).toArray()

      const revenue= result.length > 0 ? result[0].totalRevenue: 0;
      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

    // order aggregate pipline
    app.get('/order-stats', async(req, res)=>{
      const result = await paymentCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group:{
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: {$sum : '$menuItems.price'}
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray()
      res.send(result)
    })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res)=>{
  res.send("Food Master here!!");
});

app.listen(port, ()=>{
  console.log(`Food Create on port: ${port}`)
})