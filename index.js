import dns from "node:dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// ==========================================
// MONGODB
// ==========================================

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is missing from .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ==========================================
// TICKETNEST DATABASE
// AUTH_DB_NAME=ticketnest_db
// ==========================================

const db = client.db("ticketnest_db");

// Better Auth also uses ticketnest_db
const authDb = client.db(process.env.AUTH_DB_NAME);

// Collections
const ticketsCollection = db.collection("tickets");
const bookingsCollection = db.collection("bookings");
const usersCollection = authDb.collection("user");

// ==========================================
// RUN SERVER
// ==========================================

async function run() {
  try {
    await client.connect();

    await db.command({
      ping: 1,
    });

    console.log("MongoDB connected successfully");
    console.log("Ticket database: ticketnest_db");
    console.log(
      "Auth database:",
      process.env.AUTH_DB_NAME
    );

    // ==========================================
    // HOME
    // ==========================================

    app.get("/", (req, res) => {
      res.send("TicketNest Server is running!");
    });

    // ==========================================
    // GET ALL TICKETS
    // Admin Manage Tickets
    // ==========================================

    app.get("/api/tickets", async (req, res) => {
      try {
        const tickets = await ticketsCollection
          .find({})
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.json({
          success: true,
          tickets,
        });
      } catch (error) {
        console.error("Fetch tickets error:", error);

        res.status(500).json({
          success: false,
          message: "Failed to fetch tickets.",
        });
      }
    });

    // ==========================================
    // GET APPROVED TICKETS
    // ==========================================

    app.get(
      "/api/tickets/approved",
      async (req, res) => {
        try {
          const tickets = await ticketsCollection
            .aggregate([
              {
                $match: {
                  verificationStatus: "approved",
                },
              },

              {
                $lookup: {
                  from: "user",
                  localField: "vendorEmail",
                  foreignField: "email",
                  as: "vendor",
                },
              },

              {
                $match: {
                  $or: [
                    {
                      vendor: {
                        $size: 0,
                      },
                    },
                    {
                      "vendor.isFraud": {
                        $ne: true,
                      },
                    },
                  ],
                },
              },

              {
                $sort: {
                  createdAt: -1,
                },
              },
            ])
            .toArray();

          res.json({
            success: true,
            tickets,
          });
        } catch (error) {
          console.error(
            "Fetch approved tickets error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch approved tickets.",
          });
        }
      }
    );

    // ==========================================
    // GET ADVERTISED TICKETS
    // Homepage
    // Maximum 6
    // ==========================================

    app.get(
      "/api/tickets/advertised",
      async (req, res) => {
        try {
          const tickets =
            await ticketsCollection
              .aggregate([
                {
                  $match: {
                    verificationStatus: "approved",
                    isAdvertised: true,
                  },
                },

                {
                  $lookup: {
                    from: "user",
                    localField: "vendorEmail",
                    foreignField: "email",
                    as: "vendor",
                  },
                },

                {
                  $match: {
                    $or: [
                      {
                        vendor: {
                          $size: 0,
                        },
                      },
                      {
                        "vendor.isFraud": {
                          $ne: true,
                        },
                      },
                    ],
                  },
                },

                {
                  $sort: {
                    createdAt: -1,
                  },
                },

                {
                  $limit: 6,
                },
              ])
              .toArray();

          res.json({
            success: true,
            tickets,
          });
        } catch (error) {
          console.error(
            "Fetch advertised tickets error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch advertised tickets.",
          });
        }
      }
    );

    // ==========================================
    // ADD NEW TICKET
    // Vendor
    // ==========================================

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

        // Required fields
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
            message:
              "Please provide all required fields.",
          });
        }

        const cleanVendorEmail =
          vendorEmail.trim();

        // Find vendor
        const vendor =
          await usersCollection.findOne({
            email: cleanVendorEmail,
          });

        console.log(
          "Searching vendor:",
          cleanVendorEmail
        );

        if (!vendor) {
          console.log(
            "Vendor not found in ticketnest_db.user:",
            cleanVendorEmail
          );

          return res.status(404).json({
            success: false,
            message: "Vendor account not found.",
          });
        }

        console.log("Vendor found:", {
          email: vendor.email,
          name: vendor.name,
          role: vendor.role,
          isFraud: vendor.isFraud,
        });

        // Only vendor can add tickets
        if (vendor.role !== "vendor") {
          return res.status(403).json({
            success: false,
            message:
              "Only vendors can add tickets.",
          });
        }

        // Fraud vendor cannot add
        if (vendor.isFraud === true) {
          return res.status(403).json({
            success: false,
            message:
              "Fraud vendors cannot add new tickets.",
          });
        }

        // Validate price
        if (Number(price) <= 0) {
          return res.status(400).json({
            success: false,
            message:
              "Price must be greater than 0.",
          });
        }

        // Validate quantity
        if (Number(quantity) <= 0) {
          return res.status(400).json({
            success: false,
            message:
              "Quantity must be greater than 0.",
          });
        }

        // Validate departure date
        const departureDate =
          new Date(departureDateTime);

        if (
          Number.isNaN(
            departureDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid departure date.",
          });
        }

        // Departure must be future
        if (
          departureDate.getTime() <=
          Date.now()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Departure date must be in the future.",
          });
        }

        const newTicket = {
          title: title.trim(),
          from: from.trim(),
          to: to.trim(),

          transportType:
            transportType.trim(),

          price: Number(price),
          quantity: Number(quantity),

          departureDateTime:
            departureDate,

          perks: Array.isArray(perks)
            ? perks
            : [],

          image: image || "",

          vendorName:
            vendor.name ||
            vendorName.trim(),

          vendorEmail:
            vendor.email ||
            cleanVendorEmail,

          verificationStatus:
            "pending",

          isAdvertised: false,

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result =
          await ticketsCollection.insertOne(
            newTicket
          );

        res.status(201).json({
          success: true,
          message:
            "Ticket added successfully.",
          ticketId:
            result.insertedId,
        });
      } catch (error) {
        console.error(
          "Add ticket error:",
          error
        );

        res.status(500).json({
          success: false,
          message:
            "Failed to add ticket.",
        });
      }
    });

    // ==========================================
    // GET VENDOR TICKETS
    // ==========================================

    app.get(
      "/api/tickets/vendor",
      async (req, res) => {
        try {
          const { vendorEmail } =
            req.query;

          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          const tickets =
            await ticketsCollection
              .find({
                vendorEmail:
                  vendorEmail.trim(),
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.json({
            success: true,
            tickets,
          });
        } catch (error) {
          console.error(
            "Fetch vendor tickets error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch vendor tickets.",
          });
        }
      }
    );

    // ==========================================
    // EDIT TICKET
    // ==========================================

    app.patch(
      "/api/tickets/:id",
      async (req, res) => {
        try {
          const { id } = req.params;

          const {
            vendorEmail,
            title,
            from,
            to,
            transportType,
            price,
            quantity,
            departureDateTime,
            perks,
            image,
          } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          const cleanVendorEmail =
            vendorEmail.trim();

          const ticket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!ticket) {
            return res.status(404).json({
              success: false,
              message: "Ticket not found.",
            });
          }

          if (
            ticket.vendorEmail !==
            cleanVendorEmail
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You are not allowed to edit this ticket.",
            });
          }

          if (
            ticket.verificationStatus ===
            "rejected"
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Rejected tickets cannot be edited.",
            });
          }

          const vendor =
            await usersCollection.findOne({
              email: cleanVendorEmail,
            });

          if (!vendor) {
            return res.status(404).json({
              success: false,
              message:
                "Vendor account not found.",
            });
          }

          if (vendor.role !== "vendor") {
            return res.status(403).json({
              success: false,
              message:
                "Only vendors can edit tickets.",
            });
          }

          if (vendor.isFraud === true) {
            return res.status(403).json({
              success: false,
              message:
                "Fraud vendors cannot edit tickets.",
            });
          }

          const departureDate =
            new Date(departureDateTime);

          if (
            Number.isNaN(
              departureDate.getTime()
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid departure date.",
            });
          }

          if (
            departureDate.getTime() <=
            Date.now()
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Departure date must be in the future.",
            });
          }

          if (Number(price) <= 0) {
            return res.status(400).json({
              success: false,
              message:
                "Price must be greater than 0.",
            });
          }

          if (Number(quantity) <= 0) {
            return res.status(400).json({
              success: false,
              message:
                "Quantity must be greater than 0.",
            });
          }

          const updatedTicket = {
            title: title.trim(),
            from: from.trim(),
            to: to.trim(),

            transportType:
              transportType.trim(),

            price: Number(price),
            quantity: Number(quantity),

            departureDateTime:
              departureDate,

            perks: Array.isArray(perks)
              ? perks
              : [],

            image: image || "",

            updatedAt: new Date(),
          };

          await ticketsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: updatedTicket,
            }
          );

          res.json({
            success: true,
            message:
              "Ticket updated successfully.",
          });
        } catch (error) {
          console.error(
            "Edit ticket error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update ticket.",
          });
        }
      }
    );

    // ==========================================
    // APPROVE / REJECT TICKET
    // Admin
    // ==========================================

    app.patch(
      "/api/tickets/:id/status",
      async (req, res) => {
        try {
          const { id } = req.params;

          const {
            verificationStatus,
          } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          const allowedStatuses = [
            "pending",
            "approved",
            "rejected",
          ];

          if (
            !allowedStatuses.includes(
              verificationStatus
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid verification status.",
            });
          }

          const ticket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!ticket) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket not found.",
            });
          }

          const updateData = {
            verificationStatus,
            updatedAt: new Date(),
          };

          if (
            verificationStatus ===
            "rejected"
          ) {
            updateData.isAdvertised =
              false;
          }

          await ticketsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: updateData,
            }
          );

          res.json({
            success: true,
            message:
              "Ticket status updated successfully.",
          });
        } catch (error) {
          console.error(
            "Update ticket status error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update ticket status.",
          });
        }
      }
    );

    // ==========================================
    // ADVERTISE / UNADVERTISE
    // ==========================================

    app.patch(
      "/api/tickets/:id/advertise",
      async (req, res) => {
        try {
          const { id } = req.params;

          const {
            isAdvertised,
          } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          if (
            typeof isAdvertised !==
            "boolean"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "isAdvertised must be true or false.",
            });
          }

          const ticket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!ticket) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket not found.",
            });
          }

          if (
            ticket.verificationStatus !==
            "approved"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Only approved tickets can be advertised.",
            });
          }

          const vendor =
            await usersCollection.findOne({
              email: ticket.vendorEmail,
            });

          if (vendor?.isFraud === true) {
            return res.status(403).json({
              success: false,
              message:
                "Tickets from fraudulent vendors cannot be advertised.",
            });
          }

          if (isAdvertised) {
            const advertisedCount =
              await ticketsCollection.countDocuments(
                {
                  verificationStatus:
                    "approved",
                  isAdvertised: true,
                }
              );

            if (
              advertisedCount >= 6 &&
              ticket.isAdvertised !== true
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "You can advertise a maximum of 6 tickets at a time.",
              });
            }
          }

          const result =
            await ticketsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: {
                  isAdvertised,
                  updatedAt: new Date(),
                },
              }
            );

          if (
            result.modifiedCount === 0 &&
            ticket.isAdvertised !==
              isAdvertised
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Failed to update advertisement status.",
            });
          }

          res.json({
            success: true,
            message: isAdvertised
              ? "Ticket advertised successfully."
              : "Ticket unadvertised successfully.",
          });
        } catch (error) {
          console.error(
            "Advertise ticket error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update advertisement status.",
          });
        }
      }
    );

    // ==========================================
    // DELETE TICKET
    // ==========================================

    app.delete(
      "/api/tickets/:id",
      async (req, res) => {
        try {
          const { id } = req.params;

          const {
            vendorEmail,
          } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          const cleanVendorEmail =
            vendorEmail.trim();

          const ticket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!ticket) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket not found.",
            });
          }

          if (
            ticket.vendorEmail !==
            cleanVendorEmail
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You are not allowed to delete this ticket.",
            });
          }

          if (
            ticket.verificationStatus ===
            "rejected"
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Rejected tickets cannot be deleted.",
            });
          }

          const vendor =
            await usersCollection.findOne({
              email: cleanVendorEmail,
            });

          if (!vendor) {
            return res.status(404).json({
              success: false,
              message:
                "Vendor account not found.",
            });
          }

          if (vendor.role !== "vendor") {
            return res.status(403).json({
              success: false,
              message:
                "Only vendors can delete tickets.",
            });
          }

          if (vendor.isFraud === true) {
            return res.status(403).json({
              success: false,
              message:
                "Fraud vendors cannot delete tickets.",
            });
          }

          await ticketsCollection.deleteOne({
            _id: new ObjectId(id),
          });

          res.json({
            success: true,
            message:
              "Ticket deleted successfully.",
          });
        } catch (error) {
          console.error(
            "Delete ticket error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to delete ticket.",
          });
        }
      }
    );

    // ==========================================
    // CREATE BOOKING
    // User
    // ==========================================

    app.post(
      "/api/bookings",
      async (req, res) => {
        try {
          const {
            ticketId,
            userName,
            userEmail,
            quantity,
          } = req.body;

          if (
            !ticketId ||
            !userName ||
            !userEmail ||
            !quantity
          ) {
            return res.status(400).json({
              success: false,
              message:
                "All booking fields are required.",
            });
          }

          if (
            !ObjectId.isValid(ticketId)
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          const bookingQuantity =
            Number(quantity);

          if (
            !Number.isInteger(
              bookingQuantity
            ) ||
            bookingQuantity <= 0
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Booking quantity must be a positive whole number.",
            });
          }

          const ticket =
            await ticketsCollection.findOne({
              _id: new ObjectId(ticketId),
            });

          if (!ticket) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket not found.",
            });
          }

          if (
            ticket.verificationStatus !==
            "approved"
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Only approved tickets can be booked.",
            });
          }

          const vendor =
            await usersCollection.findOne({
              email: ticket.vendorEmail,
            });

          if (vendor?.isFraud === true) {
            return res.status(403).json({
              success: false,
              message:
                "Tickets from fraudulent vendors cannot be booked.",
            });
          }

          const departureDate =
            new Date(
              ticket.departureDateTime
            );

          if (
            Number.isNaN(
              departureDate.getTime()
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket departure date.",
            });
          }

          if (
            departureDate.getTime() <=
            Date.now()
          ) {
            return res.status(400).json({
              success: false,
              message:
                "This ticket has already departed.",
            });
          }

          if (
            ticket.quantity <
            bookingQuantity
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Not enough tickets available.",
            });
          }

          const unitPrice =
            Number(ticket.price);

          const totalPrice =
            unitPrice *
            bookingQuantity;

          const booking = {
            ticketId:
              new ObjectId(ticketId),

            ticketTitle:
              ticket.title,

            image:
              ticket.image || "",

            from:
              ticket.from,

            to:
              ticket.to,

            transportType:
              ticket.transportType || "",

            unitPrice,

            quantity:
              bookingQuantity,

            totalPrice,

            departureDateTime:
              departureDate,

            vendorName:
              ticket.vendorName,

            vendorEmail:
              ticket.vendorEmail,

            userName:
              userName.trim(),

            userEmail:
              userEmail.trim(),

            status:
              "pending",

            paymentStatus:
              "unpaid",

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          };

          const result =
            await bookingsCollection.insertOne(
              booking
            );

          res.status(201).json({
            success: true,
            message:
              "Booking request created successfully.",
            bookingId:
              result.insertedId,
          });
        } catch (error) {
          console.error(
            "Create booking error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to create booking.",
          });
        }
      }
    );

    // ==========================================
    // GET USER BOOKINGS
    // ==========================================

    app.get(
      "/api/bookings/user",
      async (req, res) => {
        try {
          const { userEmail } =
            req.query;

          if (!userEmail) {
            return res.status(400).json({
              success: false,
              message:
                "User email is required.",
            });
          }

          const bookings =
            await bookingsCollection
              .find({
                userEmail:
                  userEmail.trim(),
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.json({
            success: true,
            bookings,
          });
        } catch (error) {
          console.error(
            "Fetch user bookings error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch user bookings.",
          });
        }
      }
    );

    // ==========================================
    // GET VENDOR BOOKINGS
    // ==========================================

    app.get(
      "/api/bookings/vendor",
      async (req, res) => {
        try {
          const { vendorEmail } =
            req.query;

          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          const bookings =
            await bookingsCollection
              .find({
                vendorEmail:
                  vendorEmail.trim(),
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.json({
            success: true,
            bookings,
          });
        } catch (error) {
          console.error(
            "Fetch vendor bookings error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch vendor bookings.",
          });
        }
      }
    );

    // ==========================================
    // ACCEPT / REJECT BOOKING
    // Vendor
    // ==========================================

    app.patch(
      "/api/bookings/:id/status",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          const { status } =
            req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid booking ID.",
            });
          }

          if (
            ![
              "accepted",
              "rejected",
            ].includes(status)
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid booking status.",
            });
          }

          const booking =
            await bookingsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!booking) {
            return res.status(404).json({
              success: false,
              message:
                "Booking not found.",
            });
          }

          if (
            booking.status !==
            "pending"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "This booking has already been processed.",
            });
          }

          const vendor =
            await usersCollection.findOne({
              email:
                booking.vendorEmail,
            });

          if (!vendor) {
            return res.status(404).json({
              success: false,
              message:
                "Vendor account not found.",
            });
          }

          if (vendor.isFraud === true) {
            return res.status(403).json({
              success: false,
              message:
                "Fraud vendors cannot process bookings.",
            });
          }

          if (status === "accepted") {
            const ticket =
              await ticketsCollection.findOne({
                _id: booking.ticketId,
              });

            if (!ticket) {
              return res.status(404).json({
                success: false,
                message:
                  "Ticket not found.",
              });
            }

            if (
              ticket.departureDateTime &&
              new Date(
                ticket.departureDateTime
              ).getTime() <=
                Date.now()
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "This ticket has already departed.",
              });
            }

            if (
              ticket.quantity <
              booking.quantity
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Not enough tickets available.",
              });
            }

            // Quantity is NOT reduced here.
            // It will be reduced after payment.
          }

          await bookingsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                status,
                updatedAt:
                  new Date(),
              },
            }
          );

          res.json({
            success: true,
            message:
              status === "accepted"
                ? "Booking accepted successfully."
                : "Booking rejected successfully.",
          });
        } catch (error) {
          console.error(
            "Update booking status error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update booking status.",
          });
        }
      }
    );

    // ==========================================
    // GET ALL USERS
    // Admin Manage Users
    // ==========================================

    app.get(
      "/api/users",
      async (req, res) => {
        try {
          const users =
            await usersCollection
              .find({})
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.json({
            success: true,
            users,
          });
        } catch (error) {
          console.error(
            "Fetch users error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch users.",
          });
        }
      }
    );

    // ==========================================
    // CHANGE USER ROLE
    // Admin
    // ==========================================

    app.patch(
      "/api/users/:id/role",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          const { role } =
            req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid user ID.",
            });
          }

          if (
            ![
              "user",
              "admin",
              "vendor",
            ].includes(role)
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid role.",
            });
          }

          const user =
            await usersCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!user) {
            return res.status(404).json({
              success: false,
              message:
                "User not found.",
            });
          }

          await usersCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                role,
                updatedAt:
                  new Date(),
              },
            }
          );

          res.json({
            success: true,
            message:
              `User role changed to ${role}.`,
          });
        } catch (error) {
          console.error(
            "Change user role error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update user role.",
          });
        }
      }
    );

    // ==========================================
    // MARK VENDOR AS FRAUD
    // Admin
    // ==========================================

    app.patch(
      "/api/users/:id/fraud",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          const { isFraud } =
            req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid user ID.",
            });
          }

          if (
            typeof isFraud !==
            "boolean"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "isFraud must be true or false.",
            });
          }

          const user =
            await usersCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!user) {
            return res.status(404).json({
              success: false,
              message:
                "User not found.",
            });
          }

          if (
            user.role !==
            "vendor"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Only vendors can be marked as fraud.",
            });
          }

          await usersCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                isFraud,
                updatedAt:
                  new Date(),
              },
            }
          );

          if (isFraud === true) {
            await ticketsCollection.updateMany(
              {
                vendorEmail:
                  user.email,
              },
              {
                $set: {
                  isAdvertised:
                    false,
                  updatedAt:
                    new Date(),
                },
              }
            );
          }

          res.json({
            success: true,
            message: isFraud
              ? "Vendor marked as fraud successfully."
              : "Fraud status removed successfully.",
          });
        } catch (error) {
          console.error(
            "Fraud update error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to update fraud status.",
          });
        }
      }
    );

    // ==========================================
    // DEBUG USERS
    // Temporary
    // ==========================================

    app.get(
      "/api/debug-users",
      async (req, res) => {
        try {
          const collections =
            await authDb
              .listCollections()
              .toArray();

          const users =
            await usersCollection
              .find({})
              .limit(20)
              .toArray();

          res.json({
            database:
              process.env.AUTH_DB_NAME,

            collections:
              collections.map(
                (collection) =>
                  collection.name
              ),

            userCount:
              users.length,

            users,
          });
        } catch (error) {
          console.error(
            "Debug users error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              error.message,
          });
        }
      }
    );

    // ==========================================
    // START SERVER
    // ==========================================

    app.listen(port, () => {
      console.log(
        `TicketNest server running on port ${port}`
      );
    });
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error
    );
  }
}

run();