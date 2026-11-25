
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.join(
  __dirname,
  "../proto/inventory.proto"
);

const definition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  defaults: true
});

const proto = grpc.loadPackageDefinition(definition);

const client = new proto.inventory.InventoryService(
  "127.0.0.1:50051",
  grpc.credentials.createInsecure()
);

function call(method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function test() {
  try {
    console.log("1. Testing GetStock");

    const stock = await call("getStock", {
      productId: 1
    });

    console.log("Stock response:", stock);

    console.log("\n2. Testing CheckAvailability");

    const availability = await call("checkAvailability", {
      items: [{ productId: 1, quantity: 2 }]
    });

    console.log("Availability response:", availability);

    console.log("\n3. Testing ReserveStock");

    const reservation = await call("reserveStock", {
      items: [{ productId: 1, quantity: 1 }]
    });

    console.log("Reservation response:", reservation);

    console.log("\n4. Testing ReleaseStock");

    const release = await call("releaseStock", {
      items: [{ productId: 1, quantity: 1 }]
    });

    console.log("Release response:", release);

    console.log("\nAll gRPC tests completed!");

  } catch (error) {
    console.error("gRPC test failed:", error.message);
    process.exitCode = 1;

  } finally {
    client.close();
  }
}

test();
