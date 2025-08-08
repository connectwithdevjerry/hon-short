const express = require("express");
const cors = require("cors");
const multer = require("multer");
const FormData = require("form-data");
const axios = require("axios");

const app = express();
require("dotenv").config();

const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));

const upload = multer();

app.post("/upload-to-openai", upload.single("file"), async (req, res) => {
  console.log("Received request to upload file to OpenAI");
  console.log("Request body:", req.file);

  const file = req.file;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "assistants=v2",
  };

  const formData = new FormData();
  formData.append("purpose", "assistants");
  formData.append("file", file.buffer, file.originalname);

  const prompt = `You are a real estate underwriting assistant. Extract structured data from the uploaded document. The document is a property financial report, which may include a T12, rent roll, or investment summary. Your job is to extract relevant financial and property information in strictly JSON format.

Extract only what is clearly stated in the document. If a value is missing, don't include, ignore it. Format the result as clean JSON, no extra detail either before or after the JSON, strictly JSON output only.

If the document is not a property related document, return an empty JSON object.

Return data using the following schema:

{
  "property_information": {
    "name": must have a value if the document contains a property name, otherwise give it a name related to what the document imply,
    "address": null,
    "type": should be one of "multifamily", "industrial", "retail", "office", "mixed_use", or null,
    "unit_mix": [],
    "total_square_footage": null,
    "square_footage_per_unit": null,
    "number_of_units": null
  },
  "pricing_and_investment": {
    "asking_price": null,
    "offer_price": null,
    "rehab_cost": null,
    "total_investment": null,
    "closing_costs": null,
    "price_per_square_foot": null,
    "cap_rate": null
  },
  "financial_summary": {
    "effective_gross_income": null,
    "net_operating_income": null,
    "total_operating_expenses": null,
    "vacancy_loss": null,
    "misc_income": null,
    "cash_flow": null,
    "irr": null,
    "coc_return": null,
    "expense_ratio": null
  },
  "rent_roll": [
    {
      "unit_id": null,
      "unit_type": null,
      "tenant_name": null,
      "rent": null,
      "lease_start": null,
      "lease_end": null,
      "occupancy_status": null,
      "square_footage": null,
      "notes": null
    }
  ],
  "operating_expenses": {
    "taxes": null,
    "insurance": null,
    "utilities": null,
    "repairs_and_maintenance": null,
    "property_management": null,
    "marketing": null,
    "payroll": null,
    "general_admin": null,
    "reserves": null
  },
  "cash_flow_returns": {
    "cash_on_cash_return": null,
    "irr": null,
    "equity_multiple": null,
    "dscr": null,
    "loan_info": {
      "amount": null,
      "interest_rate": null,
      "amortization": null,
      "term": null
    }
  },
  "document_metadata": {
    "document_type": must be of the value "rent_roll", "t12", "offering_memo", "operating_statement", "lease", or "other",
    "upload_date": null,
    "deal_id": null,
    "uploaded_by": null,
    "associated_property": null,
    "evaluation_status": null
  }
}
`;

  const assistant_id_value = process.env.ASSITANT_ID;

  const makePropmptRequest = async (thread_id) => {
    const response = await axios.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      {
        assistant_id: assistant_id_value,
      },
      {
        headers,
      }
    );
    return response.data;
  };

  const createThread = async () => {
    const response = await axios.post(
      "https://api.openai.com/v1/threads",
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
    return response.data.id;
  };

  const vectorStore = async () => {
    return await axios.post(
      "https://api.openai.com/v1/vector_stores",
      {},
      { headers }
    );
  };

  const fileUpload = async (vector_store_id, file_id) => {
    await axios.post(
      `https://api.openai.com/v1/vector_stores/${vector_store_id}/file_batches`,
      {
        file_ids: [file_id], // The file you uploaded earlier
      },
      { headers }
    );
  };

  const updateAssistant = async (vector_store_id) => {
    await axios.post(
      `https://api.openai.com/v1/assistants/asst_fIHmj5xrjLf3pNUyi9k51heS`,
      {
        tools: [
          {
            type: "file_search",
          },
        ],
        tool_resources: {
          file_search: {
            vector_store_ids: [vector_store_id],
          },
        },
      },
      { headers }
    );
  };

  const runAssistant = async (thread_id, assistant_id) => {
    const res = await axios.post(
      `https://api.openai.com/v1/threads/${thread_id}/runs`,
      {
        assistant_id,
      },
      { headers }
    );

    return res.data.id;
  };

  const waitForRun = async (thread_id, run_id) => {
    let status = "queued";

    while (status !== "completed" && status !== "failed") {
      const res = await axios.get(
        `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
        { headers }
      );
      status = res.data.status;
      console.log("Run status:", status);
      if (status !== "completed")
        await new Promise((res) => setTimeout(res, 2000));
    }

    return status;
  };

  const getMessages = async (thread_id) => {
    const res = await axios.get(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      { headers }
    );
    const assistantMessage = res.data.data.find(
      (msg) => msg.role === "assistant"
    );
    return assistantMessage?.content[0]?.text?.value || "[No response found]";
  };

  const addMessageToThread = async (thread_id) => {
    await axios.post(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      {
        role: "user",
        content: prompt,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
  };

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/files",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );

    // const response = {};
    console.log("File uploaded:", response.data);
    const fileId = response?.data?.id;
    const vector_store = await vectorStore();

    const vector_store_id = await vector_store.data?.id;
    console.log("Vector Store ID:", vector_store_id);
    console.log("File ID:", fileId);

    await fileUpload(vector_store_id, fileId);
    await updateAssistant(vector_store_id);
    const threadId = await createThread(fileId);

    await addMessageToThread(threadId);

    const runId = await runAssistant(threadId, assistant_id_value);
    const finalStatus = await waitForRun(threadId, runId);

    if (finalStatus === "completed") {
      const reply = await getMessages(threadId);
      console.log(reply);
      return res.status(200).send(reply);
    } else {
      console.error("Run failed or didn’t complete.");
      return res.status(500).send("Run failed or didn’t complete.");
    }

    // const respData = await makePropmptRequest(threadId);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(422).send("Upload failed or processing error occurred.");
  }
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
