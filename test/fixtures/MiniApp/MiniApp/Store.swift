import StoreKit

final class Store {
    func load() async throws {
        let products = try await Product.products(for: ["com.example.pro.monthly"])
        UserDefaults.standard.set(products.count, forKey: "count")
    }
    func restore() async throws { try await AppStore.sync() }
}
