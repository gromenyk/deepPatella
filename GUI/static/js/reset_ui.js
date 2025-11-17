document.addEventListener("DOMContentLoaded", () => {
  const resetBtn = document.getElementById("reset-btn");

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (
        confirm(
          "⚠️ IMPORTANT: This will reset the user interface and delete all user data, meaning that you will have to run the inference again to obtain images, plots, etc. Are you sure you want to proceed?"
        )
      ) {

        // 1️⃣ Reset del backend general
        fetch("/cleanup", { method: "DELETE" })
          .then((res) => res.json())
          .then((data) => {

            // 2️⃣ Reset del progreso de inferencia en backend
            fetch("/reset_progress", { method: "POST" })
              .then(() => {
                console.log("Inference progress reset on backend");
              })
              .catch((err) =>
                console.error("Error resetting backend progress:", err)
              );

            // 3️⃣ Limpiar LocalStorage
            localStorage.removeItem("deepPatella_baseline_mm");
            localStorage.removeItem("deepPatella_conversion_factor");
            localStorage.removeItem("deepPatella_elongationData");
            localStorage.removeItem("deepPatella_forceData");
            localStorage.removeItem("deepPatella_hysteresisData");
            localStorage.removeItem("deepPatella_lastPairedData");
            localStorage.removeItem("deepPatella_lastRegression");
            localStorage.removeItem("deepPatella_stiffness");
            localStorage.removeItem("deepPatella_stiffness_normalized");
            localStorage.removeItem("deepPatella_last_video");

            console.log("🧹 LocalStorage cleaned: all DeepPatella data removed");

            // 4️⃣ Reset visual inmediato de barra
            const bar = document.getElementById("progress-bar-fill");
            if (bar) {
              bar.style.width = "0%";
              bar.textContent = "0%";
            }
            const time = document.getElementById("progress-time");
            if (time) time.textContent = "";

            alert("User Interface has been reset: " + data.message);
            window.location.href = "/";
          })
          .catch((err) => alert("Error when resetting: " + err));
      }
    });
  }
});
