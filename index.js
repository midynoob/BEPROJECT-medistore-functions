const functions = require("firebase-functions");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const BusBoy = require("busboy");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const multer = require("multer");
const upload = multer();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "medistore-bc0bc.appspot.com",
});

const db = admin.firestore();
const Fieldvalue = admin.firestore.FieldValue;
const Fieldpath = admin.firestore.FieldPath;
const firestore = admin.firestore;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cors({ origin: true }));

const isEmpty = (string) => {
  if (string.trim() === "") return true;
  else return false;
};

const isEmail = (email) => {
  const regex =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (email.match(regex)) return true;
  else return false;
};
// Signup route

app.post("/signup", (req, res) => {
  let reqData = req.body;
  const createdAt = new Date().toISOString();
  const newUser = {
    email: reqData.email,
    uid: reqData.uid,
    type: reqData.type,
  };

  let errors = {};
  if (isEmpty(newUser.email)) {
    errors.email = "Must not be empty";
  } else if (!isEmail(newUser.email)) {
    errors.email = "Must be a valid email address";
  }

  if (isEmpty(newUser.uid)) errors.uid = "Must not be empty";

  if (Object.keys(errors).length > 0) return res.status(400).json(errors);

  db.doc(`/users/${newUser.uid}`)
    .get()
    .then((doc) => {
      if (doc.exists) {
        return res.status(400).json({ handle: "this uid is already taken" });
      } else {
        const userCredentials = {
          email: newUser.email,
          createdAt,
          userId: newUser.uid,
          type: newUser.type,
          treatments: 0,
          docs: 0,
          patients: 0,
        };

        return db.doc(`/users/${newUser.uid}`).set(userCredentials);
      }
    })
    .then(() => {
      return res
        .status(201)
        .json({ createdAt, ...newUser, message: "user added successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

app.post("/user/update", (req, res) => {
  const uid = req.body.uid;

  let data = req.body;
  delete data.uid;

  db.collection("users")
    .doc(uid)
    .set(data, { merge: true })
    .then(() => {
      db.collection("users")
        .doc(uid)
        .get()
        .then((doc) => {
          return res.status(200).json(doc.data());
        })
        .catch((err) =>
          res.status(500).json({ message: "could not get user info" })
        );
    })
    .catch((err) =>
      res.status(500).json({ message: "could not update user info" })
    );
});

//Get Info Data route
app.post("/user", (req, res) => {
  const uid = req.body.uid;
  db.doc(`/users/${uid}`)
    .get()
    .then((doc) => {
      return res.status(200).json(doc.data());
    });
});

// Post Treatment
app.post("/createtreatment", (req, res) => {
  const uid = req.body.uid;
  const newScream = {
    name: req.body.name,
    description: req.body.description,
    createdAt: new Date().toISOString(),
    startDate: req.body.startDate,
  };

  db.collection("users")
    .doc(uid)
    .collection("treatments")
    .add(newScream)
    .then((doc) => {
      db.collection("users")
        .doc(uid)
        .collection("treatments")
        .doc(doc.id)
        .get()
        .then((resTreatement) => {
          db.collection("users")
            .doc(uid)
            .update({ treatments: Fieldvalue.increment(1) });

          const treatment = {
            ...resTreatement.data(),
            treatmentId: doc.id,
          };
          return res.status(200).json(treatment);
        })
        .catch((err) => {
          return res.status(500).json({ error: err.code });
        });
      // const treatment= {
      //   ...doc.data(),
      //   id: doc.id
      // }
      // res.status(200).json(treatment);
    })
    .catch((err) => {
      return res.status(500).json({ error: "somthing went wrong" });
      console.error(err);
    });
});

//Get Treatments
app.post("/treatments", (req, res) => {
  const uid = req.body.uid;
  const startAt = req.body.startAT;

  db.collection("users")
    .doc(uid)
    .collection("treatments")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get()
    .then((data) => {
      let treatments = [];
      data.forEach((doc) => {
        treatments.push({
          treatmentId: doc.id,
          ...doc.data(),
        });
      });
      return res.json(treatments);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
});

//// get treatment
app.post("/treatment", (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;

  db.collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .get()
    .then((doc) => {
      const treatment = {
        ...doc.data(),
        treatmentId: doc.id,
      };
      console.log(treatment);
      return res.status(200).json(treatment);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
});

app.post("/treatment/delete", async (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;
  const Bulkwriter = db.bulkWriter();
  const docRef = db
    .collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId);

  Bulkwriter.onWriteError((error) => {
    if (error.failedAttempts < MAX_RETRY_ATTEMPTS) {
      return true;
    } else {
      console.log("Failed write at document: ", error.documentRef.path);
      return false;
    }
  });

  const allDocsRef = await db
    .collection("user")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .collection("files")
    .get();

  const allDocs = await allDocsRef.docs.map(async (doc) => {
    const bucket = admin.storage().bucket();
    const fileName = doc.data().fileName;
    const file = bucket.file(fileName);

    await file.delete();
  });

  await Promise.all(allDocs);

  // await firestore.recursiveDelete(docRef, Bulkwriter);
  await db.recursiveDelete(docRef, Bulkwriter);

  return res.status(200).json({ message: "deletion Completed" });
});

app.post("/predict", (req, res) => {
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  const storageBucket = "medistore-bc0bc.appspot.com";
  const bucket = admin.storage().bucket();
  const inspect = require("util").inspect;
  const busboy = new BusBoy({ headers: req.headers });
  let imageFileName;
  let imgaeToBeUploaded = {};
  let reqData = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    )}.${imageExtension}`;
    const filePath = path.join(os.tmpdir(), imageFileName);
    imgaeToBeUploaded = { filePath, mimetype };
    file.pipe(fs.createWriteStream(filePath));
  });

  busboy.on("finish", () => {
    bucket
      .upload(imgaeToBeUploaded.filePath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imgaeToBeUploaded.mimetype,
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${imageFileName}?alt=media`;

        console.log(reqData);

        return res.status(200).json({ imageUrl, imageFileName });
      })
      .catch((err) => {
        console.error(err);
      });
  });
  busboy.end(req.rawBody);
});

app.post("/upload", (req, res) => {
  const path = require("path");
  const os = require("os");
  const fs = require("fs");
  const storageBucket = "medistore-bc0bc.appspot.com";
  const bucket = admin.storage().bucket();
  const inspect = require("util").inspect;
  const busboy = new BusBoy({ headers: req.headers });
  let imageFileName;
  let imgaeToBeUploaded = {};
  let reqData = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    )}.${imageExtension}`;
    const filePath = path.join(os.tmpdir(), imageFileName);
    imgaeToBeUploaded = { filePath, mimetype };
    file.pipe(fs.createWriteStream(filePath));
  });
  busboy.on(
    "field",
    function (
      fieldname,
      val,
      fieldnameTruncated,
      valTruncated,
      encoding,
      mimetype
    ) {
      reqData[fieldname] = val;
    }
  );

  busboy.on("finish", () => {
    bucket
      .upload(imgaeToBeUploaded.filePath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imgaeToBeUploaded.mimetype,
          },
        },
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucket}/o/${imageFileName}?alt=media`;
        const docData = {
          name: reqData.documentName,
          date: reqData.documentDate,
          description: reqData.documentDescription,
          type: reqData.documentType,
          url: imageUrl,
          fileName: imageFileName,
          createdAt: new Date().toISOString(),
          treatmentId: reqData.treatmentId,
        };
        console.log(reqData);

        db.collection("users")
          .doc(reqData.uid)
          .collection("treatments")
          .doc(reqData.treatmentId)
          .collection("files")
          .add(docData)
          .then((doc) => {
            db.collection("users")
              .doc(reqData.uid)
              .collection("treatments")
              .doc(reqData.treatmentId)
              .collection("files")
              .doc(doc.id)
              .get()
              .then((resFile) => {
                db.collection("users")
                  .doc(reqData.uid)
                  .update({ docs: Fieldvalue.increment(1) });

                const document = {
                  ...resFile.data(),
                  treatmentId: reqData.treatmentId,
                  docId: doc.id,
                };
                return res.status(200).json(document);
              });
          })
          .catch((err) => {
            return res.status(500).json({ error: "couldnot upload detaills" });
          });
      })
      .catch((err) => {
        console.error(err);
      });
  });
  busboy.end(req.rawBody);
});

///get Docs
app.post("/docs", (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;

  db.collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .collection("files")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get()
    .then((data) => {
      let docs = [];
      data.forEach((doc) => {
        docs.push({
          docId: doc.id,
          ...doc.data(),
        });
      });
      return res.json(docs);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
});

app.post("/alldocs", (req, res) => {
  const uid = req.body.uid;
  const userRef = db.collection("users").doc(uid);

  // .collection('users').doc(uid)
  // .collection('treatments').doc(treatmentId)
  db.collectionGroup("files")
    .orderBy(Fieldpath.documentId())
    .startAt(userRef.path)
    .endAt(userRef.path + "\uf8ff")
    .limit(20)
    .get()
    .then((data) => {
      let docs = [];
      data.forEach((doc) => {
        docs.push({
          docId: doc.id,
          ...doc.data(),
        });
      });
      return res.json(docs);
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
});

app.post("/doc/delete", (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;
  const fileId = req.body.fileId;
  const bucket = admin.storage().bucket();
  console.log(uid, treatmentId, fileId);

  const FileRef = db
    .collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .collection("files")
    .doc(fileId);

  FileRef.get()
    .then((doc) => {
      const fileName = doc.data().fileName;
      const file = bucket.file(fileName);
      file
        .delete()
        .then(() => {
          FileRef.delete()
            .then(() => {
              return res.status(200).json({ message: "Delete Success" });
            })
            .catch((err) => {
              return res.status(500).json({ error: "File Doc delteion err" });
            });
        })
        .catch((err) => {
          return res.status(500).json({ error: "File deletion err" });
        });
    })
    .catch((err) => {
      return res.status(500).json({ error: "File Doc cannot be found" });
    });
});

//get doctors

app.post("/treatment/doctors", async (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;
  let doctorIds = [];
  let doctors = [];

  const doctorIdsRef = await db
    .collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .get();

  doctorIds = doctorIdsRef.data().doctors ? doctorIdsRef.data().doctors : [];

  const result = await doctorIds.map(async (doctorId) => {
    doctorRef = await db.collection("users").doc(doctorId).get();

    const doctor = {
      doctorId,
      ...doctorRef.data(),
    };
    return doctor;
  });

  doctors = await Promise.all(result);

  return res.status(200).json(doctors);
});

//add doctor
app.post("/treatmentadddoctor", (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;
  const doctorId = req.body.doctorId;

  db.collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .set(
      {
        doctors: Fieldvalue.arrayUnion(doctorId),
      },
      { merge: true }
    )
    .then((data) => {
      db.collection("users")
        .doc(doctorId)
        .get()
        .then((doc) => {
          if (doc.exists) {
            const doctorData = {
              doctorId: doc.id,
              ...doc.data(),
            };

            db.collection("users")
              .doc(doctorId)
              .collection("patients")
              .where("uid", "==", uid)
              .get()
              .then((snapShot) => {
                if (snapShot.size === 0) {
                  const patient = {
                    uid,
                    treatments: [treatmentId],
                  };
                  db.collection("users")
                    .doc(doctorId)
                    .collection("patients")
                    .add(patient)
                    .then(() => {
                      return res.status(200).json(doctorData);
                    })
                    .catch((err) => {
                      return res.status(500).json({ error: err.code });
                    });
                } else {
                  snapShot.forEach((doc) => {
                    patientDocId = doc.id;
                  });
                  db.collection("users")
                    .doc(doctorId)
                    .collection("patients")
                    .doc(patientDocId)
                    .set(
                      { treatments: Fieldvalue.arrayUnion(treatmentId) },
                      { merge: true }
                    )
                    .then(() => {
                      return res.status(200).json(doctorData);
                    })
                    .catch((err) => {
                      return res.status(500).json({ error: err.code });
                    });
                }
              })
              .catch((err) => {
                return res.status(500).json({ error: err.code });
              });
          } else {
            return res.status(400).json({ message: "doctor not found" });
          }
        });
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code });
    });
});

//delete doctor
app.post("/treatment/doctor/delete", async (req, res) => {
  const uid = req.body.uid;
  const treatmentId = req.body.treatmentId;
  const doctorId = req.body.doctorId;
  let patientRefs = [];

  const patientSnapshot = await db
    .collection("users")
    .doc(doctorId)
    .collection("patients")
    .where("uid", "==", uid)
    .get();

  patientRefs = patientSnapshot.docs;
  const patientRef = patientRefs[0];
  console.log(patientRef.data(), patientRef.id);

  await db
    .collection("users")
    .doc(uid)
    .collection("treatments")
    .doc(treatmentId)
    .update({ doctors: Fieldvalue.arrayRemove(doctorId) });

  if (patientRef.data().treatments.includes(treatmentId)) {
    if (patientRef.data().treatments.length === 1) {
      await db
        .collection("users")
        .doc(doctorId)
        .collection("patients")
        .doc(patientRef.id)
        .delete();
    } else {
      await db
        .collection("users")
        .doc(doctorId)
        .collection("patients")
        .doc(patientRef.id)
        .update({ treatments: Fieldvalue.arrayRemove(treatmentId) });
    }
  }

  return res.status(200).json({ message: "deleteed doctor" });
});

////////Get patients for Doctor

app.post("/patients", async (req, res) => {
  const doctorUid = req.body.uid;
  let patientsDocs = [];
  let patients = [];

  const snapshotRes = await db
    .collection("users")
    .doc(doctorUid)
    .collection("patients")
    .get();

  const result = await snapshotRes.docs.map(async (patientDocGet) => {
    const patientDoc = patientDocGet.data();
    const patientInfoRef = db.collection("users").doc(patientDoc.uid);
    const patientInfoData = await patientInfoRef.get();
    const patient = {
      uid: patientDoc.uid,
      treatments: patientDoc.treatments,
      ...patientInfoData.data(),
      id: patientDocGet.id,
    };
    console.log(patient);
    return patient;
  });
  patients = await Promise.all(result);

  return res.status(200).json(patients);
});

app.post("/patient/treatments", async (req, res) => {
  const doctorUid = req.body.doctorsUid;
  const docId = req.body.docId;
  let treatments = [];
  let treatmentsReq;

  const PatientReq = await db
    .collection("users")
    .doc(doctorUid)
    .collection("patients")
    .doc(docId)
    .get();

  const PatientReqData = PatientReq.data();

  const uid = PatientReqData.uid;
  treatmentsReq = PatientReqData.treatments;
  const patientRef = db.collection("users").doc(uid);
  const patientData = await patientRef.get();

  const result = await treatmentsReq.map(async (treatmentId) => {
    const treatmentRef = db
      .collection("users")
      .doc(uid)
      .collection("treatments")
      .doc(treatmentId);
    const treatmentData = await treatmentRef.get();

    const treatment = {
      ...treatmentData.data(),
      treatmentId,
      patientName: patientData.data().name,
      uid,
    };

    if (treatmentData.data().doctors.includes(doctorUid)) {
      return treatment;
    } else return undefined;
  });
  treatments = await Promise.all(result);

  return res
    .status(200)
    .json({ patientName: patientData.data().name, treatments });
});

app.post("/patient/treatment", (req, res) => {
  const treatmentId = req.body.treatmentId;
  const doctorUid = req.body.doctorUid;
  const uid = req.body.uid;

  db.collection("users")
    .doc(uid)
    .get()
    .then((user) => {
      db.collection("users")
        .doc(uid)
        .collection("treatments")
        .doc(treatmentId)
        .get()
        .then((treatment) => {
          if (treatment.data().doctors.includes(doctorUid)) {
            const resData = {
              patient: user.data(),
              treatment: treatment.data(),
            };
            return res.status(200).json(resData);
          } else {
            return res.status(200).json({ message: "Treatment unathorized" });
          }
        })
        .catch((err) => {
          return res.status(500).json({ message: " somthin whent rong" });
        });
    })
    .catch((err) => {
      return res.status(500).json({ message: " somthin whent rong 2" });
    });
});

app.post("/alltreatments", async (req, res) => {
  const doctorUid = req.body.uid;
  console.log(doctorUid);
  let Patients = [];
  let AllTreatments = [];

  const PatientsSnapShot = await db
    .collection("users")
    .doc(doctorUid)
    .collection("patients")
    .get();

  const getPatients = await PatientsSnapShot.docs.map(async (patientDocGet) => {
    const patientDoc = patientDocGet.data();
    const patient = {
      uid: patientDoc.uid,
      treatments: patientDoc.treatments,
      id: patientDocGet.id,
    };
    return patient;
  });
  Patients = await Promise.all(getPatients);

  const getAllTreatments = await Patients.map(async (patient) => {
    let PatientTreatment;
    const getTreatments = await patient.treatments.map(async (treatmentId) => {
      const TreatmentRef = await db
        .collection("users")
        .doc(patient.uid)
        .collection("treatments")
        .doc(treatmentId)
        .get();
      const data = {
        ...TreatmentRef.data(),
        uid: patient.uid,
        treatmentId: TreatmentRef.id,
      };
      return data;
    });
    PatientTreatment = await Promise.all(getTreatments);

    return PatientTreatment;
  });

  const result2 = await Promise.all(getAllTreatments);
  console.log(result2);

  const result = [].concat.apply([], result2);
  console.log(result);

  return res.status(200).json(result);
});

exports.api = functions.region("asia-south1").https.onRequest(app);
