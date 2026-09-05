import dns from "node:dns";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} from "mongodb";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const port = 5000;



app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


const db = client.db("ticketnest_db");



const ticketsCollection = db.collection("tickets");

const bookingsCollection = db.collection("bookings");

async function run() {
  try {
    await client.connect();

    await client.db("admin").command({
      ping: 1,
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

 

    app.get("/", (req, res) => {
      res.send("TicketNest Server is running!");
    });


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
        console.error(
          "Get all tickets error:",
          error
        );

        res.status(500).json({
          success: false,
          message: "Failed to fetch tickets.",
        });
      }
    });


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
              "Ticket quantity must be greater than 0.",
          });
        }

        const departureDate = new Date(
          departureDateTime
        );

        if (
          Number.isNaN(
            departureDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid departure date and time.",
          });
        }

  
        const newTicket = {
          title: title.trim(),
          from: from.trim(),
          to: to.trim(),

          transportType,

          price: Number(price),

          quantity: Number(quantity),

          departureDateTime: departureDate,

          perks: Array.isArray(perks)
            ? perks
            : [],

          image: image || "",

          vendorName: vendorName.trim(),

          vendorEmail: vendorEmail.trim(),

          verificationStatus: "pending",

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

          ticket: {
            _id: result.insertedId,
            ...newTicket,
          },
        });
      } catch (error) {
        console.error(
          "Add ticket error:",
          error
        );

        res.status(500).json({
          success: false,
          message: "Failed to add ticket.",
        });
      }
    });


    app.get(
      "/api/tickets/vendor",
      async (req, res) => {
        try {
          const { vendorEmail } = req.query;

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
                vendorEmail: vendorEmail,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.status(200).json({
            success: true,
            tickets,
          });
        } catch (error) {
          console.error(
            "Get vendor tickets error:",
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


    app.patch(
      "/api/tickets/:id",
      async (req, res) => {
        try {
          const id = req.params.id;

          const {
            vendorEmail,
            ...updateData
          } = req.body;


          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "Invalid ticket ID.",
            });
          }


          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }


          const existingTicket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!existingTicket) {
            return res.status(404).json({
              success: false,
              message: "Ticket not found.",
            });
          }


          if (
            existingTicket.vendorEmail !==
            vendorEmail
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You are not authorized to update this ticket.",
            });
          }

      
          if (
            existingTicket.verificationStatus ===
            "rejected"
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Rejected tickets cannot be updated.",
            });
          }

          // Validate price
          if (
            updateData.price !== undefined &&
            Number(updateData.price) <= 0
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Price must be greater than 0.",
            });
          }

          // Validate quantity
          if (
            updateData.quantity !== undefined &&
            Number(updateData.quantity) <= 0
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Ticket quantity must be greater than 0.",
            });
          }

          // Validate departure date
          if (
            updateData.departureDateTime !==
            undefined
          ) {
            const departureDate = new Date(
              updateData.departureDateTime
            );

            if (
              Number.isNaN(
                departureDate.getTime()
              )
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Invalid departure date and time.",
              });
            }
          }

          // Fields to update
          const updatedFields = {
            updatedAt: new Date(),
          };

          if (
            updateData.title !== undefined
          ) {
            updatedFields.title =
              updateData.title.trim();
          }

          if (
            updateData.from !== undefined
          ) {
            updatedFields.from =
              updateData.from.trim();
          }

          if (
            updateData.to !== undefined
          ) {
            updatedFields.to =
              updateData.to.trim();
          }

          if (
            updateData.transportType !==
            undefined
          ) {
            updatedFields.transportType =
              updateData.transportType;
          }

          if (
            updateData.price !== undefined
          ) {
            updatedFields.price = Number(
              updateData.price
            );
          }

          if (
            updateData.quantity !== undefined
          ) {
            updatedFields.quantity = Number(
              updateData.quantity
            );
          }

          if (
            updateData.departureDateTime !==
            undefined
          ) {
            updatedFields.departureDateTime =
              new Date(
                updateData.departureDateTime
              );
          }

          if (
            updateData.perks !== undefined
          ) {
            updatedFields.perks =
              Array.isArray(
                updateData.perks
              )
                ? updateData.perks
                : [];
          }

          if (
            updateData.image !== undefined
          ) {
            updatedFields.image =
              updateData.image;
          }

          // Update ticket
          const result =
            await ticketsCollection.updateOne(
              {
                _id: new ObjectId(id),
                vendorEmail: vendorEmail,
              },
              {
                $set: updatedFields,
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket could not be updated.",
            });
          }

          // Get updated ticket
          const updatedTicket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          res.status(200).json({
            success: true,
            message:
              "Ticket updated successfully.",
            ticket: updatedTicket,
          });
        } catch (error) {
          console.error(
            "Update ticket error:",
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

    app.delete(
      "/api/tickets/:id",
      async (req, res) => {
        try {
          const id = req.params.id;

          const { vendorEmail } = req.body;

          // Validate ID
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          // Validate vendor email
          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          // Find existing ticket
          const existingTicket =
            await ticketsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!existingTicket) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket not found.",
            });
          }

          // Check ownership
          if (
            existingTicket.vendorEmail !==
            vendorEmail
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You are not authorized to delete this ticket.",
            });
          }

          // Rejected tickets cannot be deleted
          if (
            existingTicket.verificationStatus ===
            "rejected"
          ) {
            return res.status(403).json({
              success: false,
              message:
                "Rejected tickets cannot be deleted.",
            });
          }

          // Delete ticket
          const result =
            await ticketsCollection.deleteOne({
              _id: new ObjectId(id),
              vendorEmail: vendorEmail,
            });

          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message:
                "Ticket could not be deleted.",
            });
          }

          res.status(200).json({
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

    app.post(
      "/api/bookings",
      async (req, res) => {
        try {
          const {
            userName,
            userEmail,
            ticketId,
            quantity,
          } = req.body;

          // Validate required fields
          if (
            !userName ||
            !userEmail ||
            !ticketId ||
            quantity === undefined
          ) {
            return res.status(400).json({
              success: false,
              message:
                "User name, user email, ticket ID, and quantity are required.",
            });
          }

          // Validate ticket ID
          if (!ObjectId.isValid(ticketId)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid ticket ID.",
            });
          }

          // Validate quantity
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

          // Find ticket
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

          // Only approved tickets can be booked
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

          // Check available quantity
          if (
            bookingQuantity >
            Number(ticket.quantity)
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Requested quantity is greater than available tickets.",
            });
          }

          // Calculate total price
          const unitPrice =
            Number(ticket.price);

          const totalPrice =
            unitPrice * bookingQuantity;

          // Create booking
          const newBooking = {
            userName: userName.trim(),

            userEmail: userEmail.trim(),

            ticketId: ticket._id,

            ticketTitle: ticket.title,

            quantity: bookingQuantity,

            unitPrice: unitPrice,

            totalPrice: totalPrice,

            vendorEmail:
              ticket.vendorEmail,

            status: "pending",

            createdAt: new Date(),

            updatedAt: new Date(),
          };

          const result =
            await bookingsCollection.insertOne(
              newBooking
            );

          res.status(201).json({
            success: true,

            message:
              "Booking request submitted successfully.",

            booking: {
              _id: result.insertedId,

              ...newBooking,
            },
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



    app.get(
      "/api/bookings/vendor",
      async (req, res) => {
        try {
          const { vendorEmail } =
            req.query;

          // Validate vendor email
          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          // Find vendor bookings
          const bookings =
            await bookingsCollection
              .find({
                vendorEmail:
                  vendorEmail,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.status(200).json({
            success: true,
            bookings,
          });
        } catch (error) {
          console.error(
            "Get vendor bookings error:",
            error
          );

          res.status(500).json({
            success: false,
            message:
              "Failed to fetch booking requests.",
          });
        }
      }
    );


    app.patch(
      "/api/bookings/:id/status",
      async (req, res) => {
        try {
          const id = req.params.id;

          const {
            vendorEmail,
            status,
          } = req.body;

          // Validate booking ID
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid booking ID.",
            });
          }

          // Validate vendor email
          if (!vendorEmail) {
            return res.status(400).json({
              success: false,
              message:
                "Vendor email is required.",
            });
          }

          // Allowed statuses
          const allowedStatuses = [
            "pending",
            "accepted",
            "rejected",
          ];

          if (
            !allowedStatuses.includes(
              status
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid booking status. Status must be pending, accepted, or rejected.",
            });
          }

          // Find booking
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

          // Check vendor ownership
          if (
            booking.vendorEmail !==
            vendorEmail
          ) {
            return res.status(403).json({
              success: false,
              message:
                "You are not authorized to update this booking.",
            });
          }

          // Only pending bookings can change
          if (
            booking.status !== "pending"
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Only pending bookings can be accepted or rejected.",
            });
          }

   

          if (status === "accepted") {
            // Find associated ticket
            const ticket =
              await ticketsCollection.findOne({
                _id: new ObjectId(
                  booking.ticketId
                ),
              });

            if (!ticket) {
              return res.status(404).json({
                success: false,
                message:
                  "The ticket associated with this booking no longer exists.",
              });
            }

            // Check available quantity
            if (
              Number(ticket.quantity) <
              Number(booking.quantity)
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Not enough tickets are available to accept this booking.",
              });
            }

            // Decrease ticket quantity
            const ticketUpdate =
              await ticketsCollection.updateOne(
                {
                  _id: new ObjectId(
                    booking.ticketId
                  ),

                  vendorEmail:
                    vendorEmail,

                  quantity: {
                    $gte: Number(
                      booking.quantity
                    ),
                  },
                },
                {
                  $inc: {
                    quantity:
                      -Number(
                        booking.quantity
                      ),
                  },

                  $set: {
                    updatedAt:
                      new Date(),
                  },
                }
              );

            if (
              ticketUpdate.modifiedCount ===
              0
            ) {
              return res.status(400).json({
                success: false,
                message:
                  "Ticket quantity could not be updated. Please try again.",
              });
            }
          }

      
          const result =
            await bookingsCollection.updateOne(
              {
                _id: new ObjectId(id),

                vendorEmail:
                  vendorEmail,

                status: "pending",
              },
              {
                $set: {
                  status: status,

                  updatedAt:
                    new Date(),
                },
              }
            );

          if (
            result.matchedCount === 0
          ) {
            return res.status(404).json({
              success: false,
              message:
                "Booking could not be updated.",
            });
          }

      
          const updatedBooking =
            await bookingsCollection.findOne({
              _id: new ObjectId(id),
            });

          res.status(200).json({
            success: true,

            message:
              status === "accepted"
                ? "Booking accepted successfully."
                : "Booking rejected successfully.",

            booking: updatedBooking,
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
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error
    );
  }
}


run();


app.listen(port, () => {
  console.log(
    `Server running on port ${port}`
  );
});