import { useContext } from "react";
import { Link, Outlet } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function MainLayout() {
  const { user, logout } = useContext(AuthContext);

  // Define your full sidebar menu and which roles can see them
  const menuItems = [
    { name: "Dashboard", path: "/", roles: ["Admin", "ZSM", "RSM", "Distributor", "Retailer"] },
    { name: "Order Hub", path: "/orders", roles: ["Admin", "ZSM", "Distributor", "Retailer"] },
    { name: "Inventory", path: "/inventory", roles: ["Admin", "Distributor", "Retailer"] },
    { name: "Partner Master", path: "/partners", roles: ["Admin", "ZSM"] },
    { name: "Geography Master", path: "/geography", roles: ["Admin"] },
    { name: "Product Master", path: "/products", roles: ["Admin"] },
    { name: "User Matrix", path: "/user-matrix", roles: ["Admin"] },
  ];

  // Filter out items the user shouldn't see
  const allowedMenuItems = menuItems.filter(item =>
    !user || !item.roles || item.roles.includes(user?.role) || user?.role === "Admin"
  );

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-4 font-bold text-xl border-b text-blue-600">HOM System</div>
        <nav className="flex-1 p-4 space-y-2">
          {allowedMenuItems.map((item) => (
            <Link key={item.path} to={item.path} className="block p-2 hover:bg-gray-200 rounded text-gray-700">
              {item.name}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col">
        <header className="bg-white shadow p-4 flex justify-between items-center">
          <div className="font-semibold text-lg text-gray-700">
             Welcome, {user?.username} <span className="text-sm text-gray-500">({user?.role})</span>
          </div>
          <button onClick={logout} className="bg-red-500 text-white px-4 py-2 rounded shadow hover:bg-red-600">
            Logout
          </button>
        </header>
        <main className="p-6 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}