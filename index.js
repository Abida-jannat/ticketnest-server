import dns from "node:dns";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const port = 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database and collection
const db = client.db("ticketnest_db");
const ticketsCollection = db.collection("tickets");

// Connect MongoDB
async function run() {
  try {
    await client.connect();

    await client.db("admin").command({ ping: 1 });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // ==============================
    // HOME ROUTE
    // ==============================

    app.get("/", (req, res) => {
      res.send("TicketNest Server is running!");
    });

    // ==============================
    // GET ALL TICKETS
    // ==============================

    app.get("/api/tickets", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          tickets,
        });
      } catch (error) {
        console.error("Get all tickets error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to fetch tickets.",
        });
      }
    });

    // ==============================
    // ADD TICKET
    // ==============================

    app.post("/api/tickets", async (req, res) => {
      try {
        const {
          title,
          from,
          to,
          transportType,
          price,
          quantity,
          departureDateTime,
          perks,
          image,
          vendorName,
          vendorEmail,
        } = req.body;

        // Required field validation
        if (
          !title ||
          !from ||
          !to ||
          !transportType ||
          price === undefined ||
          quantity === undefined ||
          !departureDateTime ||
          !vendorName ||
          !vendorEmail
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide all required fields.",
          });
        }

        // Validate price
        if (Number(price) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Price must be greater than 0.",
          });
        }

        // Validate quantity
        if (Number(quantity) <= 0) {
          return res.status(400).json({
            success: false,
            message: "Ticket quantity must be greater than 0.",
          });
        }

        // Create ticket
        const newTicket = {
          title: title.trim(),

          from: from.trim(),
          to: to.trim(),

          transportType,

          price: Number(price),
          quantity: Number(quantity),

          departureDateTime: new Date(departureDateTime),

          perks: Array.isArray(perks) ? perks : [],

          image: image || "",

          vendorName: vendorName.trim(),
          vendorEmail: vendorEmail.trim(),

          // Verification status
          verificationStatus: "pending",

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await ticketsCollection.insertOne(newTicket);

        res.status(201).json({
          success: true,
          message: "Ticket added successfully.",
          ticket: {
            _id: result.insertedId,
            ...newTicket,
          },
        });
      } catch (error) {
        console.error("Add ticket error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to add ticket.",
        });
      }
    });

    // ==============================
    // GET VENDOR'S TICKETS
    // ==============================

    app.get("/api/tickets/vendor", async (req, res) => {
      try {
        const { vendorEmail } = req.query;

        if (!vendorEmail) {
          return res.status(400).json({
            success: false,
            message: "Vendor email is required.",
          });
        }

        const tickets = await ticketsCollection
          .find({
            vendorEmail: vendorEmail,
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          tickets,
        });
      } catch (error) {
        console.error("Get vendor tickets error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to fetch vendor tickets.",
        });
      }
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run();

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});