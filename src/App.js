import React, { useState, useEffect, useRef } from "react";
import {
  GoogleMap,
  LoadScript,
  Marker,
  DirectionsRenderer,
} from "@react-google-maps/api";

import { db, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  onSnapshot,
  getDocs,
  updateDoc,
  doc,
  increment,
  getDoc,
} from "firebase/firestore";
import HospitalPanel from "./HospitalPanel";
import { auth, provider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

const containerStyle = {
  width: "100%",
  height: "100vh",
};

const libraries = ["places", "geometry"];

function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [map, setMap] = useState(null);
  const [accidentLocation, setAccidentLocation] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [nearestHospital, setNearestHospital] = useState(null);
  const [directions, setDirections] = useState(null);
  const [alertDirections, setAlertDirections] = useState(null);
  const [ambulancePosition, setAmbulancePosition] = useState(null);
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [eta, setEta] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertLocation, setAlertLocation] = useState(null);
  const [alertID, setAlertID] = useState(null);
  const [user, setUser] = useState(null);
  const [trustScore, setTrustScore] = useState(0);
  const [isArrived, setIsArrived] = useState(false);
  const [currentAccidentId, setCurrentAccidentId] = useState(null);
  const [confirmCount, setConfirmCount] = useState(1);
  const [isAmbulanceActive, setIsAmbulanceActive] = useState(false);
  const [dispatchData, setDispatchData] = useState(null);
  const [view, setView] = useState("map");
  const [voiceSOS, setVoiceSOS] = useState(false);
  const [routerOwnerID, setRouterOwnerID] = useState(null);
  const animationRef = useRef(null);
  const [showBot, setShowBot] = useState(false);
  const [botInput, setBotInput] = useState("");
  const [botReply, setBotReply] = useState("");
  const [botLoading, setBotLoading] = useState(false);

  const [showPhotoPrompt, setShowPhotoPrompt] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lastReportId, setLastReportId] = useState(null);

  const alertSoundRef = useRef(
    new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"),
  );
  const locationRef = useRef(null);
  const lastAlertRef = useRef(null);
  const lastSOSRef = useRef(0);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };
  // testing

  const ambulanceIcon = {
    url: "https://img.icons8.com/color/48/ambulance.png",
  };

  // AUTH
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleLogin = async () => await signInWithPopup(auth, provider);
  const handleLogout = () => signOut(auth);

  useEffect(() => {
    if (!user) return;

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        setTrustScore(snap.data().trustScore || 0);
      } else {
        setTrustScore(0);
      }
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!voiceSOS) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text =
        event.results[event.results.length - 1][0].transcript.toLowerCase();

      if (
        text.includes("sos") ||
        text.includes("help") ||
        text.includes("emergency")
      ) {
        const now = Date.now();
        if (now - lastSOSRef.current > 20000) {
          lastSOSRef.current = now;
          handleSOS();
        }
      }
    };

    recognition.start();

    return () => recognition.stop();
  }, [voiceSOS, userLocation, user]);

  useEffect(() => {
    if (!alertID) return;

    const unsub = onSnapshot(doc(db, "accidents", alertID), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConfirmCount(data.confirmations || 1);

        if (data.status === "completed") {
          setAlertMsg("✅ Accident resolved!");
          setAlertLocation(null);
        }
      }
    });

    return () => unsub();
  }, [alertID]);

  useEffect(() => {
    if (!currentAccidentId) return;

    const unsub = onSnapshot(
      doc(db, "accidents", currentAccidentId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();

          if (data.status === "completed") {
            setAlertMsg("✅ Help Reached");
            setAlertLocation(null);
          }
        }
      },
    );

    return () => unsub();
  }, [currentAccidentId]);

  // LOCATION
  useEffect(() => {
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });

        locationRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => alert("Location denied"),
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (map && userLocation) {
      map.panTo(userLocation);
      map.setZoom(15);
    }
  }, [userLocation, map]);

  // ALERT SYSTEM (UNCHANGED)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "accidents"), (snapshot) => {
      console.log("🔥 SNAPSHOT RUNNING");

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();

        if (change.type === "added" && change.doc.id !== lastAlertRef.current) {
          if (
            data.status === "active" &&
            locationRef.current &&
            data.userId !== user?.uid
          ) {
            const dist = getDistance(
              locationRef.current.lat,
              locationRef.current.lng,
              data.lat,
              data.lng,
            );

            if (dist <= 2) {
              lastAlertRef.current = change.doc.id;

              setAlertID(change.doc.id);

              alertSoundRef.current.currentTime = 0;
              alertSoundRef.current.play();

              setTimeout(() => {
                alertSoundRef.current.pause();
                alertSoundRef.current.currentTime = 0;
              }, 5000);

              setAlertMsg("🚨 Accident reported nearby!");

              setAlertLocation({
                lat: data.lat,
                lng: data.lng,
              });

              setConfirmCount(data.confirmations || 1);
            }
          }
        }

        // 🔥 only modified events (jab dispatched change hoga)
        if (change.type === "modified") {
          console.log("🔥 MODIFIED DETECTED");
          console.log("Current Data:", data);

          // safety check
          // if (!userLocation) {
          //   console.log("❌ User location not available yet");
          //   return;
          // }

          // 🚑 dispatch trigger
          if (
            data.dispatched === true &&
            data.status === "active" &&
            data.userId === user?.uid
          ) {
            console.log("🚑 DISPATCH TRIGGERED");

            setDispatchData({
              id: change.doc.id,
              ...data,
            });

            setRouterOwnerID(data.userId);
          }
        }
      });
    });

    return () => unsub();
  }, [user]);

  // useEffect(() => {
  //   if (dispatchData && userLocation) {
  //     console.log("🚑 STARTING AMBULANCE");

  //     drawRoute(userLocation, { lat: dispatchData.lat, lng: dispatchData.lng });
  //   }
  // }, [dispatchData, userLocation]);

  //fix 3
  useEffect(() => {
    if (!dispatchData) return;

    findHospitals({
      lat: dispatchData.lat,
      lng: dispatchData.lng,
    });
  }, [dispatchData]);

  //fix 4
  useEffect(() => {
    if (!dispatchData || !nearestHospital) return;

    if (isAmbulanceActive) return; // duplicate stop

    console.log("🚑 START FROM HOSPITAL");

    drawRoute(nearestHospital.geometry.location, {
      lat: dispatchData.lat,
      lng: dispatchData.lng,
    });
  }, [nearestHospital]);

  // CLICK → REPORT
  const findExistingAccident = async (location) => {
    const snapshot = await getDocs(collection(db, "accidents"));

    for (let d of snapshot.docs) {
      const data = d.data();
      if (data.status === "completed") continue;

      const accidentTime = data.time?.toDate?.();
      if (!accidentTime) continue;

      const dist = getDistance(location.lat, location.lng, data.lat, data.lng);

      const diff = (new Date() - accidentTime) / 1000;

      if (dist < 0.15 && diff < 180) {
        return d.id;
      }
    }

    return null;
  };

  const handleMapClick = async (e) => {
    if (!user) return alert("Login first");

    const location = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };

    // const geocoder = new window.google.maps.Geocoder();

    // const placeResult = await geocoder.geocode({ location });

    // const placeName =
    //   placeResult.results?.[0]?.formatted_address || "Unknown Location";

    // 🔥 STEP 1 — check existing accident FIRST
    const existingId = await findExistingAccident(location);

    if (existingId) {
      await updateDoc(doc(db, "accidents", existingId), {
        confirmations: increment(1),
      });

      setAlertMsg("🚨 Already Reported! Thanks for confirming!");
      return;
    }

    // 🔥 STEP 2 — now block same user
    if (isAmbulanceActive) {
      setAlertMsg("🚑 You already have an active accident!");
      return;
    }

    // 🔥 STEP 3 — create new accident
    setAccidentLocation(location);

    const docRef = await addDoc(collection(db, "accidents"), {
      lat: location.lat,
      lng: location.lng,
      userId: user.uid,
      userName: user.displayName,
      trustScore: trustScore,
      // placeName: placeName,
      time: new Date(),
      confirmations: 1,
      status: "active",
      dispatched: false,
    });

    setCurrentAccidentId(docRef.id);
    setConfirmCount(1);

    setAlertMsg("🚨 Accident Reported!");
    setLastReportId(docRef.id);
    setShowPhotoPrompt(true);

    findHospitals(location);
  };

  // ALERT ROUTE
  const showRouteToAccident = (loc) => {
    if (!userLocation) return;

    const service = new window.google.maps.DirectionsService();

    service.route(
      { origin: userLocation, destination: loc, travelMode: "DRIVING" },
      (res, status) => {
        if (status === "OK") setAlertDirections(res);
      },
    );
  };

  // ORIGINAL HOSPITAL LOGIC (UNCHANGED)
  const findHospitals = (location) => {
    const service = new window.google.maps.places.PlacesService(
      new window.google.maps.Map(document.createElement("div")),
    );

    service.nearbySearch(
      {
        location,
        radius: 5000, // 🔥 thoda increase for better results
        type: "hospital",
      },
      (results, status) => {
        if (status === "OK" && results.length > 0) {
          const filtered = results.filter((h) => {
            if (!h.geometry || !h.geometry.location) return false;

            const name = h.name?.toLowerCase() || "";

            // 🔥 MUST HAVE (real hospital words)
            const isHospital =
              name.includes("hospital") ||
              name.includes("medical college") ||
              name.includes("institute") ||
              name.includes("multispeciality") ||
              name.includes("trauma") ||
              name.includes("health center");

            // ❌ REMOVE FAKE / SMALL
            const reject =
              name.includes("dental") ||
              name.includes("clinic") ||
              name.includes("pathology") ||
              name.includes("lab") ||
              name.includes("pharmacy") ||
              name.includes("store");

            // 🔥 QUALITY CHECK
            const hasGoodRating = h.rating && h.rating >= 3.8;
            const hasReviews =
              h.user_ratings_total && h.user_ratings_total >= 20;

            return isHospital && !reject && hasGoodRating && hasReviews;
          });

          // 🔥 fallback if nothing found
          const baseList = filtered.length > 0 ? filtered : results;

          // 🔥 find nearest properly
          let nearest = null;
          let minDist = Infinity;

          baseList.forEach((h) => {
            const dist =
              window.google.maps.geometry.spherical.computeDistanceBetween(
                new window.google.maps.LatLng(location),
                h.geometry.location,
              );

            if (dist < minDist) {
              minDist = dist;
              nearest = h;
            }
          });

          if (!nearest) {
            console.log("❌ No hospital found");
            return;
          }

          setHospitals(baseList);
          setNearestHospital(nearest);

          // drawRoute(nearest.geometry.location, location);
        }
      },
    );
  };
  // ROUTE + ANIMATION (FIXED)
  const drawRoute = (origin, destination) => {
    setDirections(null);
    setAmbulancePosition(null);

    const service = new window.google.maps.DirectionsService();

    service.route(
      {
        origin,
        destination,
        travelMode: "DRIVING",
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: "bestguess",
        },
      },
      (result, status) => {
        if (status === "OK") {
          setIsAmbulanceActive(true);
          setDirections(result);

          const leg = result.routes[0]?.legs[0];
          if (!leg) return;

          setDistance(leg.distance?.text || "N/A");
          setDuration(leg.duration?.text || "N/A");

          setEta(
            leg.duration_in_traffic
              ? leg.duration_in_traffic.text
              : leg.duration.text,
          );

          const path = result.routes[0].overview_path;

          setAmbulancePosition({
            lat: path[0].lat(),
            lng: path[0].lng(),
          });

          animateAmbulance(path);
        }
      },
    );
  };

  const animateAmbulance = (path) => {
    let i = 0;
    let progress = 0;
    const speed = 0.03; // kam = slow, zyada = fast

    animationRef.current = setInterval(() => {
      if (i >= path.length - 1) {
        clearInterval(animationRef.current);

        setIsArrived(true);
        setIsAmbulanceActive(false);

        if (dispatchData?.id) {
          updateDoc(doc(db, "accidents", dispatchData.id), {
            status: "completed",
            dispatched: false,
          });
        }

        return;
      }

      const start = path[i];
      const end = path[i + 1];

      const lat = start.lat() + (end.lat() - start.lat()) * progress;

      const lng = start.lng() + (end.lng() - start.lng()) * progress;

      setAmbulancePosition({
        lat: lat,
        lng: lng,
      });

      progress += speed;

      if (progress >= 1) {
        progress = 0;
        i++;
      }
    }, 50);
  };

  const handleSOS = async () => {
    if (!user || !userLocation) {
      alert("Login and allow location first");
      return;
    }

    const docRef = await addDoc(collection(db, "accidents"), {
      lat: userLocation.lat,
      lng: userLocation.lng,
      userId: user.uid,
      time: new Date(),
      confirmations: 1,
      status: "active",
      dispatched: false,
      type: "sos",
    });

    setCurrentAccidentId(docRef.id);
    setAlertMsg("🚨 SOS Sent Successfully!");
    setConfirmCount(1);
  };

  //chatbot

  const askBot = async () => {
    if (!botInput.trim()) return;

    setBotLoading(true);
    setBotReply("");

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      "You are an emergency first aid assistant. " +
                      "Reply in 4 to 5 short bullet points only. " +
                      "Each point under 8 words. " +
                      "No paragraphs. No long explanations. " +
                      "Clear practical steps only. " +
                      "Question: " +
                      botInput,
                  },
                ],
              },
            ],
          }),
        },
      );

      const data = await res.json();
      console.log("Bot response:", data);

      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";

      setBotReply(text);
    } catch (error) {
      setBotReply("Error getting response.");
    }

    setBotLoading(false);
  };

  const analyzeAccidentPhoto = async (imageURL, reportId) => {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Analyze this accident image. Reply only in this format: Severity: High/Medium/Low. Summary: short one line.",
                  },
                  {
                    file_data: {
                      mime_type: "image/jpeg",
                      file_uri: imageURL,
                    },
                  },
                ],
              },
            ],
          }),
        },
      );

      const data = await res.json();

      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Severity: Unknown. Summary: Could not analyze.";

      await updateDoc(doc(db, "accidents", reportId), {
        aiStatus: "done",
        aiSummary: reply,
        severity: "Updated",
      });
    } catch (error) {
      await updateDoc(doc(db, "accidents", reportId), {
        aiStatus: "failed",
        aiSummary: "AI analysis failed.",
        severity: "Unknown",
      });
    }
  };

  const uploadAccidentPhoto = async () => {
    console.log("🚗 Uploading photo for accident ID:", lastReportId);
    console.log("🚗 Selected photo:", selectedPhoto);
    if (!selectedPhoto || !lastReportId) {
      setShowPhotoPrompt(false);
      return;
    }

    try {
      const imageRef = ref(
        storage,
        `accidents/${lastReportId}/${Date.now()}_${selectedPhoto.name}`,
      );

      await uploadBytes(imageRef, selectedPhoto);

      const imageURL = await getDownloadURL(imageRef);

      await updateDoc(doc(db, "accidents", lastReportId), {
        photoURL: imageURL,
        photoStatus: "uploaded",
        aiStatus: "pending",
        severity: "pending",
        aiSummary: "Analyzing photo, please wait...",
      });

      analyzeAccidentPhoto(imageURL, lastReportId);

      setAlertMsg("📷 Photo uploaded successfully!");
    } catch (error) {
      console.log(error);
      setAlertMsg("❌ Photo upload failed.");
    }

    setShowPhotoPrompt(false);
    setSelectedPhoto(null);
  };

  const handleReset = () => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
    }

    setDispatchData(null);
    setIsAmbulanceActive(false);
    setDirections(null);

    setAlertMsg("");
    setAlertLocation(null);
    setAlertDirections(null);
    setAccidentLocation(null);
    setHospitals([]);
    setNearestHospital(null);
    setDirections(null);
    setAmbulancePosition(null);
    setDistance("");
    setDuration("");
    setEta("");
  };

  // if (view === "hospital") {
  //   return <HospitalPanel goBack={() => setView("map")} />;
  // }

  return (
    <LoadScript
      googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_API_KEY}
      libraries={libraries}
    >
      {/* 🔁 SWITCH BUTTON */}
      <button
        onClick={() => setView(view === "map" ? "hospital" : "map")}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 9999,
          background: "#111111",
          color: "#ffffff",
          border: "none",
          padding: "12px 18px",
          borderRadius: "14px",
          fontWeight: "700",
          fontSize: "14px",
          letterSpacing: "0.3px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
          cursor: "pointer",
        }}
      >
        Switch to {view === "map" ? "Hospital" : "Map"}
      </button>

      {/* 🏥 HOSPITAL PANEL */}
      {view === "hospital" && <HospitalPanel />}

      {/* 🗺 MAP VIEW */}
      {view === "map" && (
        <>
          {/* LOGIN */}
          <div
            style={{
              position: "absolute",
              top: 72,
              left: 16,
              zIndex: 9999,
              background: "rgba(255,255,255,0.96)",
              padding: "16px",
              borderRadius: "18px",
              boxShadow: "0 12px 28px rgba(0,0,0,0.14)",
              minWidth: "240px",
              backdropFilter: "blur(10px)",
            }}
          >
            {user ? (
              <>
                <p
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "16px",
                    fontWeight: "700",
                  }}
                >
                  👤 {user.displayName}
                </p>

                <p
                  style={{
                    margin: "0 0 12px 0",
                    color: "#2563eb",
                    fontWeight: "700",
                    background: "#eff6ff",
                    padding: "8px 10px",
                    borderRadius: "10px",
                    display: "inline-block",
                  }}
                >
                  ⭐ Trust Score: {trustScore}
                </p>

                <br />

                <button
                  onClick={handleLogout}
                  style={{
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                style={{
                  background: "#111",
                  color: "#fff",
                  border: "none",
                  padding: "12px 18px",
                  borderRadius: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Login with Google
              </button>
            )}
          </div>

          {/* ALERT */}
          {alertMsg && (
            <div
              style={{
                position: "absolute",
                top: 20,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 9999,
                background: "linear-gradient(135deg, #ff3b30, #d90429)",
                color: "#ffffff",
                padding: "16px",
                maxWidth: "270px",
                borderRadius: "18px",
                boxShadow: "0 18px 30px rgba(255,59,48,0.28)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <p
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "16px",
                  fontWeight: "800",
                  lineHeight: "1.4",
                }}
              >
                🚨 {alertMsg}
              </p>

              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "14px",
                  opacity: 0.95,
                  fontWeight: "600",
                }}
              >
                👥 Confirmed by {confirmCount} users
              </p>

              {alertLocation && (
                <button
                  onClick={() => showRouteToAccident(alertLocation)}
                  style={{
                    background: "#ffffff",
                    color: "#111111",
                    border: "none",
                    padding: "10px 14px",
                    borderRadius: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  📍 View & Navigate
                </button>
              )}
            </div>
          )}

          {/* PANEL */}
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              zIndex: 9999,
              width: "260px",
              background: "rgba(255,255,255,0.94)",
              padding: "16px",
              borderRadius: "18px",
              boxShadow: "0 18px 38px rgba(0,0,0,0.14)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.45)",
            }}
          >
            <p
              style={{
                margin: "0 0 10px 0",
                fontSize: "16px",
                fontWeight: "800",
                color: "#111111",
              }}
            >
              🚑 Live Route Status
            </p>

            <p style={{ margin: "6px 0", fontWeight: "700", color: "#1f2937" }}>
              📏 Distance: {distance || "--"}
            </p>

            <p style={{ margin: "6px 0", fontWeight: "700", color: "#1f2937" }}>
              ⏱ Time: {duration || "--"}
            </p>

            <p style={{ margin: "6px 0", fontWeight: "700", color: "#1f2937" }}>
              🚦 ETA: {eta || "--"}
            </p>
          </div>

          <button
            onClick={handleSOS}
            style={{
              position: "absolute",
              bottom: 78,
              right: 18,
              zIndex: 9999,
              width: "78px",
              height: "78px",
              borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg,#ff3b30,#d90429)",
              color: "#ffffff",
              fontWeight: "800",
              fontSize: "18px",
              boxShadow: "0 0 28px rgba(255,59,48,0.45)",
              cursor: "pointer",
            }}
          >
            🚨 SOS
          </button>

          <button
            onClick={() => setVoiceSOS(!voiceSOS)}
            style={{
              position: "absolute",
              bottom: 170,
              right: 18,
              zIndex: 9999,
              background: voiceSOS ? "#16a34a" : "#111111",
              color: "#ffffff",
              border: "none",
              padding: "12px 16px",
              borderRadius: "14px",
              fontWeight: "700",
              boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
              cursor: "pointer",
            }}
          >
            🎤 {voiceSOS ? "Voice SOS ON" : "Voice SOS OFF"}
          </button>

          <button
            onClick={() => setShowBot(!showBot)}
            style={{
              position: "absolute",
              bottom: 220,
              right: 18,
              zIndex: 9999,
              background: "#111111",
              color: "#ffffff",
              border: "none",
              padding: "12px 16px",
              borderRadius: "14px",
              fontWeight: "700",
              boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
              cursor: "pointer",
            }}
          >
            🩺 Emergency Guide
          </button>

          {showBot && (
            <div
              style={{
                position: "absolute",
                bottom: 278,
                right: 18,
                zIndex: 9999,
                width: "320px",
                background: "rgba(255,255,255,0.97)",
                padding: "16px",
                borderRadius: "18px",
                boxShadow: "0 18px 35px rgba(0,0,0,0.16)",
                backdropFilter: "blur(12px)",
              }}
            >
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontWeight: "800",
                  fontSize: "22px",
                  color: "#111111",
                  textAlign: "center",
                }}
              >
                🩺 Emergency Guide
              </p>
              <input
                value={botInput}
                onChange={(e) => setBotInput(e.target.value)}
                placeholder="Ask emergency help..."
                style={{
                  width: "100%",
                  padding: "12px",
                  marginBottom: "12px",
                  borderRadius: "12px",
                  border: "1px solid #d1d5db",
                  outline: "none",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />

              <button
                onClick={askBot}
                style={{
                  width: "100%",
                  background: "#111111",
                  color: "#ffffff",
                  border: "none",
                  padding: "12px",
                  borderRadius: "12px",
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {botLoading ? "Thinking..." : "Send"}
              </button>

              <div
                style={{
                  marginTop: "12px",
                  background: "linear-gradient(135deg, #111827, #1f2937)",
                  padding: "18px",
                  borderRadius: "16px",
                  maxHeight: "420px",
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  lineHeight: "2",
                  fontSize: "15px",
                  fontWeight: "700",
                  color: "#f9fafb",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                }}
              >
                {botReply.replace(/\*\*/g, "").replace(/\*/g, "• ").trim()}
              </div>
            </div>
          )}

          {showPhotoPrompt && (
            <div
              style={{
                position: "absolute",
                top: "34%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 99999,
                background: "rgba(255,255,255,0.98)",
                padding: "24px",
                borderRadius: "22px",
                boxShadow: "0 22px 48px rgba(0,0,0,0.18)",
                width: "370px",
                textAlign: "center",
                backdropFilter: "blur(12px)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "22px",
                  fontWeight: "800",
                  color: "#111111",
                  letterSpacing: "0.2px",
                }}
              >
                📷 Upload Accident Photo
              </h3>

              <p
                style={{
                  fontSize: "14px",
                  color: "#6b7280",
                  margin: "0 0 16px 0",
                  lineHeight: "1.6",
                }}
              >
                Optional: Helps hospital verify emergency faster.
              </p>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedPhoto(e.target.files[0])}
                style={{
                  marginTop: "10px",
                  marginBottom: "16px",
                  width: "100%",
                  padding: "10px",
                  border: "1px solid #d1d5db",
                  borderRadius: "12px",
                  background: "#f9fafb",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              />

              <div
                style={{
                  marginTop: "14px",
                  display: "flex",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => setShowPhotoPrompt(false)}
                  style={{
                    background: "#f3f4f6",
                    color: "#111111",
                    border: "none",
                    padding: "12px 18px",
                    borderRadius: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    minWidth: "110px",
                  }}
                >
                  Skip
                </button>

                <button
                  onClick={uploadAccidentPhoto}
                  style={{
                    background: "#111111",
                    color: "#ffffff",
                    border: "none",
                    padding: "12px 18px",
                    borderRadius: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    minWidth: "110px",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.16)",
                  }}
                >
                  Upload
                </button>
              </div>
            </div>
          )}

          {/* RESET */}
          <button
            onClick={handleReset}
            style={{
              position: "absolute",
              bottom: 18,
              right: 16,
              zIndex: 9999,
              background: "#111111",
              color: "#ffffff",
              border: "none",
              padding: "12px 18px",
              borderRadius: "999px",
              fontWeight: "800",
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
            }}
          >
            🔄 Reset
          </button>

          {/* LEGEND */}
          <div
            style={{
              position: "absolute",
              bottom: 20,
              left: 10,
              background: "#fff",
              padding: 10,
              borderRadius: 10,
              zIndex: 9999,
            }}
          >
            <p
              style={{
                margin: "0 0 10px 0",
                fontWeight: "800",
                fontSize: "14px",
                color: "#111111",
                letterSpacing: "0.3px",
              }}
            >
              📍 MAP LEGEND
            </p>

            <p style={{ margin: "7px 0", fontWeight: "700" }}>🟠 You</p>

            <p style={{ margin: "7px 0", fontWeight: "700", color: "#ef4444" }}>
              🔴 Accident Spot
            </p>

            <p style={{ margin: "7px 0", fontWeight: "700", color: "#2563eb" }}>
              🔵 Hospitals
            </p>

            <p style={{ margin: "7px 0", fontWeight: "700", color: "#16a34a" }}>
              🟢 Nearest Hospital
            </p>

            <p style={{ margin: "7px 0", fontWeight: "700", color: "#111111" }}>
              🚑 Live Ambulance
            </p>
          </div>

          <GoogleMap
            mapContainerStyle={containerStyle}
            center={userLocation || { lat: 26.84, lng: 80.94 }}
            zoom={15}
            onLoad={(m) => setMap(m)}
            onClick={handleMapClick}
            options={{ mapTypeControl: true }}
          >
            {userLocation && (
              <Marker
                position={userLocation}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/orange-dot.png",
                }}
              />
            )}
            {accidentLocation && <Marker position={accidentLocation} />}

            {hospitals.map((h, i) => (
              <Marker
                key={i}
                position={{
                  lat: h.geometry.location.lat(),
                  lng: h.geometry.location.lng(),
                }}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                }}
              />
            ))}

            {nearestHospital && (
              <Marker
                position={{
                  lat: nearestHospital.geometry.location.lat(),
                  lng: nearestHospital.geometry.location.lng(),
                }}
                icon={{
                  url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
                }}
              />
            )}

            {ambulancePosition && routerOwnerID === user?.uid && (
              <Marker position={ambulancePosition} icon={ambulanceIcon} />
            )}

            {directions && routerOwnerID === user?.uid && (
              <DirectionsRenderer directions={directions} />
            )}
            {alertDirections && (
              <DirectionsRenderer directions={alertDirections} />
            )}
          </GoogleMap>
        </>
      )}
    </LoadScript>
  );
}

export default App;
