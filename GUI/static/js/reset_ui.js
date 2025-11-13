document.addEventListener("DOMContentLoaded", () => {
  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (
        confirm(
          "⚠️ IMPORTANT: This will reset the user interface and delete all user data, meaning that you will have to run the inference again to obtain images, plots, etc. Are you sure you want to proceed?"
        )
      ) {
        fetch("/cleanup", { method: "DELETE" })
          .then((res) => res.json())
          .then((data) => {
            // 🧹 Limpiar variables locales
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

            alert("User Interface has been reset: " + data.message);
            window.location.href = "/";
          })
          .catch((err) => alert("Error when resetting: " + err));
      }
    });
  }
});
