//require("dotenv").config();
//const app = require("./app");

//const PORT = process.env.PORT || 8083;

//app.listen(PORT, () => {
  //console.log(`Inventory service running on http://localhost:${PORT}`);
//});

require("dotenv").config();

const app = require("./app");
const { startGrpcServer } = require("./grpcServer");

const PORT = process.env.PORT || 8083;

// تشغيل REST Server
app.listen(PORT, () => {
  console.log(
    `Inventory REST Server running on http://localhost:${PORT}`
  );
});

// تشغيل gRPC Server
startGrpcServer();
