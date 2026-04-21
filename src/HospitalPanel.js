import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  deleteDoc,
  setDoc,
  increment,
} from "firebase/firestore";

function HospitalPanel() {
  const [accidents, setAccidents] = useState([]);
  const [loadingId, setLoadingId] = useState(null);
  const [locationNames, setLocationNames] = useState([]);
  const [completedCases, setCompletedCases] = useState([]);

  const reviewCase = async (caseData, result) => {
    const scoreChange = result === "genuine" ? 10 : -20;

    const userRef = doc(db, "users", caseData.userId);

    try {
      await updateDoc(userRef, {
        trustScore: increment(scoreChange),
      });
    } catch (error) {
      await setDoc(userRef, {
        trustScore: scoreChange,
      });
    }

    await deleteDoc(doc(db, "accidents", caseData.id));

    alert(
      result === "genuine"
        ? "✅ Genuine case reviewed (+10)"
        : "❌ False case reviewed (-20)",
    );
  };

  const clearCompleted = async () => {
    const snapshot = await getDocs(collection(db, "accidents"));

    snapshot.forEach(async (docSnap) => {
      const data = docSnap.data();

      if (data.status === "completed") {
        await deleteDoc(doc(db, "accidents", docSnap.id));
      }
    });

    alert("✅ Completed records cleared");
  };

  const clearAllData = async () => {
    const snapshot = await getDocs(collection(db, "accidents"));

    snapshot.forEach(async (docSnap) => {
      await deleteDoc(doc(db, "accidents", docSnap.id));
    });

    alert("⚠ All test data cleared");
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "accidents"), (snapshot) => {
      const list = [];
      const completedList = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // 🔥 sirf active accidents dikhana
        if (data.status === "active") {
          list.push({ id: docSnap.id, ...data });
        }

        if (data.status === "completed") {
          completedList.push({ id: docSnap.id, ...data });
        }
      });

      list.sort((a, b) => b.time?._seconds - a.time?._seconds); // latest first
      setAccidents(list);
      setCompletedCases(completedList);
    });

    return () => unsub();
  }, []);

  const getLocationName = (lat, lng, id) => {
    const geocoder = new window.google.maps.Geocoder();

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    geocoder.geocode(
      {
        location: {
          lat: latitude,
          lng: longitude,
        },
      },
      (results, status) => {
        if (status === "OK" && results && results.length > 0) {
          setLocationNames((prev) => ({
            ...prev,
            [id]: results[0].formatted_address,
          }));
        } else {
          setLocationNames((prev) => ({
            ...prev,
            [id]: `Lat ${latitude}, Lng ${longitude}`,
          }));
        }
      },
    );
  };

  const handleDispatch = async (id) => {
    setLoadingId(id);
    await updateDoc(doc(db, "accidents", id), {
      dispatched: true,

      //status: "active" // status ko active hi
    });

    //console.log("🚑 DISPATCHED:",);
    setLoadingId(null);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2
        style={{
          textAlign: "center",
          marginBottom: "18px",
          fontWeight: "800",
          fontSize: "26px",
          color: "#111111",
          letterSpacing: "0.4px",
        }}
      >
        🏥 Hospital Panel
      </h2>

      <button
        onClick={clearCompleted}
        style={{
          background: "green",
          color: "#fff",
          border: "none",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "10px",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        🗑 Clear Completed
      </button>

      <button
        onClick={clearAllData}
        style={{
          background: "red",
          color: "#fff",
          border: "none",
          padding: "10px 14px",
          borderRadius: "8px",
          marginBottom: "10px",
          marginLeft: "10px",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        ⚠ Clear All Test Data
      </button>

      {accidents.length === 0 && <p>No active accidents</p>}

      <hr
        style={{
          marginTop: "25px",
          marginBottom: "15px",
          border: "none",
          borderTop: "2px dashed #ccc",
        }}
      />

      <h3
        style={{
          marginTop: "25px",
          background: "#e8f7e8",
          padding: "10px",
          borderRadius: "10px",
        }}
      >
        ✅ Completed Cases Review
      </h3>

      {completedCases.length === 0 && <p>No completed cases</p>}

      {completedCases.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid green",
            padding: 10,
            marginBottom: 10,
            background: "#f6fff6",
          }}
        >
          <p>👤 {c.userName || "Unknown User"}</p>
          <p>⭐ Trust Score: {c.trustScore || 0}</p>
          <p>📍 {c.placeName || `${c.lat}, ${c.lng}`}</p>
          <p>👥 Confirmations: {c.confirmations}</p>
          <p>User ID: {c.userId}</p>

          <button
            onClick={() => reviewCase(c, "genuine")}
            style={{ marginRight: "10px" }}
          >
            ✅ Genuine +10
          </button>

          <button onClick={() => reviewCase(c, "false")}>❌ False -20</button>
        </div>
      ))}

      <h3
        style={{
          marginTop: "20px",
          background: "#ffe9e9",
          padding: "10px",
          borderRadius: "10px",
        }}
      >
        🚨 Active Emergency Cases
      </h3>

      {accidents.map((a) => (
        <div
          key={a.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
          }}
        >
          <p>👤 {a.userName || "Unknown User"}</p>
          <p>⭐ Trust Score: {a.trustScore || 0}</p>

          <p>📍 {locationNames[a.id] || `${a.lat}, ${a.lng}`}</p>

          {a.photoURL && (
            <div style={{ marginTop: "8px" }}>
              <p style={{ color: "green", fontWeight: "bold" }}>
                📷 Photo Attached
              </p>

              <a
                href={a.photoURL}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "#007bff",
                  textDecoration: "none",
                  fontWeight: "bold",
                }}
              >
                View Image
              </a>

              <p
                style={{
                  marginTop: "8px",
                  fontWeight: "bold",
                  color: a.aiSummary?.toLowerCase().includes("high")
                    ? "red"
                    : a.aiSummary?.toLowerCase().includes("medium")
                      ? "orange"
                      : a.aiSummary?.toLowerCase().includes("low")
                        ? "green"
                        : a.aiSummary?.toLowerCase().includes("no accident")
                          ? "black"
                          : "#b8860b",
                }}
              >
                {a.aiSummary?.toLowerCase().includes("high")
                  ? "🔴 HIGH SEVERITY"
                  : a.aiSummary?.toLowerCase().includes("medium")
                    ? "🟠 MEDIUM SEVERITY"
                    : a.aiSummary?.toLowerCase().includes("low")
                      ? "🟢 LOW SEVERITY"
                      : a.aiSummary?.toLowerCase().includes("no accident")
                        ? "⚫ FAKE / NO ACCIDENT"
                        : "🟡 PENDING"}
              </p>

              <p
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#111827",
                  marginTop: "10px",
                  background: "linear-gradient(135deg, #eef7ff, #f8fbff)",
                  padding: "14px",
                  borderRadius: "12px",
                  lineHeight: "1.8",
                  borderLeft: "5px solid #2563eb",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                  letterSpacing: "0.2px",
                }}
              >
                📋{" "}
                {a.aiSummary
                  ?.replace(/Severity:\s*(High|Medium|Low)\.?/i, "")
                  .replace("Summary:", "")
                  .replace("The image displays", "Image shows")
                  .trim()}
              </p>
            </div>
          )}

          <p>👥 Confirmations: {a.confirmations}</p>

          <button
            disabled={loadingId === a.id || a.dispatched}
            onClick={() => handleDispatch(a.id)}
          >
            {loadingId === a.id
              ? "Dispatching..."
              : a.dispatched
                ? "🚑 Ambulance En Route"
                : "🚑 Dispatch Ambulance"}
          </button>
        </div>
      ))}
    </div>
  );
}

export default HospitalPanel;
