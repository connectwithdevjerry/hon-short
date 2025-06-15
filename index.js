const express = require("express");
const cors = require("cors");

const app = express();
require("dotenv").config();

const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));

app.post("/my-n8n-endpoint", async (req, res) => {
  const response = await fetch(
    "https://n8n.srv805351.hstgr.cloud/webhook-test/real-estate-upload",
    {
      method: req.method,
      body: req.body,
    }
  );
  const data = await response.text(); // or .json()
  console.log("Response from n8n:", data);
  res.status(response.status).send(data);
});

app.get("/", (req, res) => {
  console.log("Server is running");
  res.send("this endpoint is for testing the server!");
});

app.listen(PORT, (err) => {
  if (err) {
    console.log("server error", err);
  } else {
    console.log(`check running server on url http://localhost:${PORT}`);
  }
});
