
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const repo = require("./inventoryRepository");

// تحديد مكان ملف proto
const PROTO_PATH = path.join(
  __dirname,
  "../proto/inventory.proto"
);

// قراءة ملف proto
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

// تحميل تعريف الخدمات
const proto = grpc.loadPackageDefinition(packageDefinition);
const inventoryProto = proto.inventory;

// تحويل أخطاء Repository إلى أخطاء gRPC
function convertError(error) {
  let code = grpc.status.INTERNAL;

  if (error.status === 400) {
    code = grpc.status.INVALID_ARGUMENT;
  } else if (error.status === 404) {
    code = grpc.status.NOT_FOUND;
  } else if (error.status === 409) {
    code = grpc.status.FAILED_PRECONDITION;
  } else if (error.status === 503) {
    code = grpc.status.UNAVAILABLE;
  }

  return {
    code,
    details: error.message || "Internal server error"
  };
}

// تحويل العناصر إلى الشكل الذي يستعمله Repository
function convertItems(items) {
  return items.map(item => ({
    productId: item.productId,
    quantity: item.quantity
  }));
}

// العمليات الأربع التي يقدمها Inventory
const inventoryService = {

  // 1. الحصول على كمية المخزون
  getStock: async (call, callback) => {
    try {
      const productId = Number(call.request.productId);

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new repo.HttpError(400, "Invalid productId.");
      }

      const stock = await repo.getStock(productId);

      if (stock === null) {
        throw new repo.HttpError(
          404,
          `Unknown product: ${productId}`
        );
      }

      callback(null, { productId, stock });

    } catch (error) {
      callback(convertError(error));
    }
  },

  // 2. التحقق من توفر المنتجات
  checkAvailability: async (call, callback) => {
    try {
      const items = convertItems(call.request.items);

      const available = await repo.checkAvailability(items);

      callback(null, { available });

    } catch (error) {
      callback(convertError(error));
    }
  },

  // 3. حجز المنتجات
  reserveStock: async (call, callback) => {
    try {
      const items = convertItems(call.request.items);

      const result = await repo.reserve(items);

      callback(null, { success: result.success });

    } catch (error) {
      callback(convertError(error));
    }
  },

  // 4. إرجاع المنتجات إلى المخزون
  releaseStock: async (call, callback) => {
    try {
      const items = convertItems(call.request.items);

      const result = await repo.release(items);

      callback(null, { success: result.success });

    } catch (error) {
      callback(convertError(error));
    }
  }
};

// تشغيل gRPC Server
function startGrpcServer() {
  const server = new grpc.Server();

  server.addService(
    inventoryProto.InventoryService.service,
    inventoryService
  );

  const port = process.env.GRPC_PORT || 50051;
  const address = `0.0.0.0:${port}`;

  server.bindAsync(
    address,
    grpc.ServerCredentials.createInsecure(),
    (error, boundPort) => {
      if (error) {
        console.error("gRPC server error:", error);
        return;
      }

      

      console.log(
        `Inventory gRPC Server running on port ${boundPort}`
      );
    }
  );

  return server;
}

module.exports = { startGrpcServer };
