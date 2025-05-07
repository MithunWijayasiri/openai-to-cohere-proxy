const express = require("express");
   const app = express();
   const openAIToCohereProxy = require("./api/openai-to-cohere");
   
   app.use(express.json());
   app.post("/api/openai-to-cohere", (req, res) => openAIToCohereProxy(req, res));
   
   const PORT = 3000;
   app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
