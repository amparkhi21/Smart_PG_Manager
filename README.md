# 🏠 Smart PG Manager — Smart Paying Guest Management System

**Manage Rooms. Track Residents. Simplify Payments.**

Smart PG Manager is a full-stack web application designed to help Paying Guest (PG) owners manage their properties through a single, organized dashboard. The platform brings room availability, resident information, daily attendance, rent collection, electricity billing, and payment tracking into one place.

Built using modern web technologies, Smart PG Manager aims to reduce manual paperwork, improve record accuracy, and make everyday PG operations easier to manage.

**Project Status:** 🚧 In Development

## 🌟 Live Demo

**Live Application:** Coming Soon  
**Backend API:** Currently configured for local development

Core modules have been built and tested locally. Attendance, rent, and electricity backend operations have also been tested, while their newer frontend integrations are being completed and verified. A public deployment has not yet been confirmed.

## 📌 Problem Statement

Many PG owners manage rooms, resident details, attendance, rent payments, and electricity charges using notebooks, spreadsheets, or scattered messages. This makes it difficult to track vacant beds, monitor outstanding dues, find payment history, and maintain accurate records.

Smart PG Manager aims to solve this problem by providing a centralized system for managing day-to-day PG operations with less manual effort.

## 💡 Proposed Solution

Smart PG Manager provides a user-friendly digital workspace where PG owners can maintain room and resident information, record attendance, generate monthly charges, collect installment payments, and review financial summaries.

The system is designed to provide clearer visibility into property occupancy and outstanding payments, with the flexibility to add automated reminders and further management tools in future releases.

## ✨ Key Features

### 🏘️ Room Management

- Add, view, edit, and manage rooms
- Configure room number, capacity, and monthly rent
- Track room occupancy and available beds
- Prevent duplicate room numbers and invalid capacity changes
- Protect occupied rooms from invalid deletion

### 👥 Resident Management

- Add and manage resident records
- Assign residents to available rooms
- View resident profiles and room details
- Track active and former residents
- Validate room capacity before assigning new residents

### 📅 Attendance Management

- Mark residents as Present, Absent, or On Leave
- View attendance by date
- Record optional attendance notes
- Support bulk attendance updates
- Review monthly attendance summaries

*Attendance backend APIs have been tested. Frontend integration and regression testing are part of ongoing development.*

### 💰 Rent Management

- Generate monthly rent records
- Track billed, paid, pending, and overdue rent
- Record partial and full payments
- Apply payment submissions atomically against the current balance and make retry IDs idempotent
- Preserve individual payment installments
- View resident-wise balances and payment history
- Prevent duplicate rent generation and overpayments

*Rent backend operations have been tested. The Rent Management and Payment History frontend modules are being integrated and verified.*

### ⚡ Electricity Bill Management

- Record room-wise electricity meter readings
- Calculate units consumed from previous and current readings
- Calculate charges using the applicable per-unit rate
- Track electricity balances and payment status
- Record installment payments and retain payment history
- Prevent duplicate bills for the same room and month

*Electricity billing and payment backend operations have been tested. The frontend module is under development.*

### 📊 Owner Dashboard

- View room occupancy and active resident counts
- Monitor rent billed, collected, and pending
- Track electricity billing and outstanding amounts
- Review important PG management summaries in one place

### 💬 WhatsApp Reminder Preparation & PG Settings

- Review unpaid rent and room-based electricity bills using current backend records
- Prepare individual WhatsApp click-to-chat messages with editable previews
- Select a current active resident explicitly for room electricity bills
- Review owner-scoped reminder history with draft, WhatsApp-opened, and owner-reported statuses
- Configure property details, future billing defaults, duplicate-warning preferences, and message templates
- Bulk-prepare reminder drafts without automatically sending messages

*WhatsApp messages are never sent by the application. Owners review and manually send each message in WhatsApp; no delivery or read status is claimed.*

### 📑 Payment Receipts, Reports & Exports

- Download an individual rent or electricity payment receipt using its persisted payment transaction ID.
- Receipts state “Payment Recorded”; they do not claim bank verification or tax-invoice status.
- Review monthly billed amounts, collections against those billing records, current balances, and payments received by transaction date as separate measures.
- Download a monthly PDF report and UTF-8 CSV exports for rooms, residents, attendance, rent, electricity, payments, and financial summaries.
- CSV exports omit resident contact and emergency-contact details; formula-leading text is escaped.

*The authenticated `GET /api/reports?month=YYYY-MM` endpoint is read-only and returns only the logged-in owner’s reporting data.*

*Payment endpoints use conditional atomic balance updates; repeated submissions carrying the same request ID do not append another installment.*

### 🔐 Authentication & Data Security

- Owner registration and login
- JWT-based authentication
- Protected frontend routes
- Owner-specific access to rooms, residents, and financial records
- Environment-based configuration for credentials and secrets

## 🧰 Technology Stack

| Technology | Purpose |
|---|---|
| React.js | Interactive frontend interface |
| Vite | Frontend development and build tooling |
| Tailwind CSS | Responsive UI styling |
| JavaScript | Frontend and backend application logic |
| Node.js | Backend runtime |
| Express.js | REST API development |
| MongoDB Atlas | Cloud database |
| Mongoose | MongoDB data modeling |
| JWT | Authentication and protected APIs |
| Axios | Frontend-to-backend API communication |
| Git & GitHub | Version control and code hosting |

## 🏗️ System Architecture

```text
                PG OWNER
                   |
                   v
           React.js Frontend
                   |
                   v
          Axios / REST API
                   |
                   v
           Node.js + Express
                   |
        +----------+-----------+
        |          |           |
        v          v           v
 Authentication  PG Records  Billing Logic
    (JWT)       & Attendance (Rent/Electricity)
        |          |           |
        +----------+-----------+
                   |
                   v
             MongoDB Atlas
                   |
                   v
         Dashboard & Payment Data
```

### Architecture Overview

- **React.js:** Provides the interface for owners to navigate modules, fill forms, and review management data.
- **Node.js and Express.js:** Handle authentication, validation, business logic, and REST API requests.
- **MongoDB and Mongoose:** Store owners, rooms, residents, attendance records, bills, and payments.
- **JWT:** Helps secure routes and keep each owner's information separate.
- **Axios:** Connects frontend pages to backend services.

## 📂 Project Structure

The application is organized into separate frontend and server modules.

```text
smart-pg-manager/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── utils/
│   │   └── App.jsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── utils/
│   └── package.json
│
├── README.md
└── .gitignore
```

*This is a representative structure. Check the repository for the exact current file and folder names.*

## 🚀 Installation & Setup

Use Node.js 20 or newer for the frontend (React Router 7 requirement). The backend package currently supports Node.js 18 or newer.

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd smart-pg-manager
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with the URL of your GitHub repository.

### 2. Set Up the Backend

Open a terminal in the `server` directory:

```powershell
cd server
npm.cmd install
```

Create a `.env` file in `server/`. Use the following as an example, adjusting it to the variables required by your installed backend:

```env
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
```

Start the backend:

```powershell
npm.cmd run dev
```

The backend normally runs at `http://localhost:5000`. A basic health endpoint is available at `http://localhost:5000/api/health` when the server is running.

### 3. Set Up the Frontend

Open **another terminal** from the project root:

```powershell
cd frontend
npm.cmd install
```

If the repository includes `.env.example`, copy it to `.env`:

```powershell
Copy-Item .env.example .env
```

Configure the backend URL using the **exact environment variable name expected by the frontend API client**. Do not assume a variable name without checking the project's `.env.example` and `src/api/client.js`.

Start the frontend:

```powershell
npm.cmd run dev
```

Open `http://localhost:5173` or the local URL shown in the terminal.

### 4. Verify the Build

From the `frontend` directory, run:

```powershell
npm.cmd run build
```

A successful build checks that the frontend can be bundled. It does not replace browser testing or backend integration tests.

Run the frontend utility/receipt/report tests from `frontend/` and the backend model/API smoke tests from `server/` with:

```powershell
npm.cmd test
```

**Security note:** Never upload `.env` files, database passwords, JWT secrets, or real resident personal information to GitHub. Do not run database seed scripts against data you intend to preserve.

## 🔄 Application Workflow

1. The PG owner registers or logs in.
2. The owner creates rooms and sets their rent and capacity.
3. Residents are added and assigned to rooms with available space.
4. The owner records daily attendance and checks monthly summaries.
5. Monthly rent and electricity records are generated or entered through the relevant modules.
6. Payments are recorded, and outstanding balances are updated.
7. The dashboard helps the owner review occupancy and finances.

*The complete workflow depends on which frontend modules are available in the current development version.*

## 🎯 Project Objectives

Smart PG Manager is being developed to demonstrate practical skills in:

- Full-stack web application development
- React.js frontend development and responsive design
- REST API development with Node.js and Express.js
- MongoDB data modeling and integration
- Authentication and authorization with JWT
- Real-world CRUD operations and data validation
- Financial record handling and installment tracking
- API integration, testing, and debugging

## 🔮 Future Enhancements

Planned improvements include downloadable receipts, reports and exports, enhanced analytics, and public deployment. Direct WhatsApp Business Platform messaging, if added, will require explicit owner authorization and the appropriate business credentials and consent.

## 👩‍💻 Author

**Parkhi Kumari**

B.Tech Computer Science and Engineering — AI & Data Science

Interested in Full-Stack Development, Artificial Intelligence, and Software Engineering.

---

### ⭐ Smart PG Manager — Making PG Management Simpler, Smarter, and More Organized.
