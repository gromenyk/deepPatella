// reset_ui.js
//
// Full UI reset handler for DeepPatella.
//
// This script attaches the logic behind the “Reset UI” button in the top menu.
// It performs a complete cleanup of the application state, both on the backend
// and the frontend, ensuring that the user returns to a clean starting point.
//
// Responsibilities:
//
//   1. Show a confirmation dialog before performing any destructive action
//   2. Send a DELETE request to the backend /cleanup endpoint
//      → clears cached frames, CSVs, temporary outputs, NPZ files, etc.
//   3. Trigger /reset_progress to fully reset inference state server-side
//   4. Remove all DeepPatella-related entries from localStorage
//      (baseline, conversion factor, elongation, force, regression, stiffness…)
//   5. Reset UI elements such as the progress bar and elapsed time text
//   6. Redirect the user back to the home page once cleanup is complete
//
// Notes:
//   - This action is irreversible and requires the user to re-run inference
//   - LocalStorage is namespaced with “deepPatella_*”
//   - The reset affects all modules: baseline, stiffness, frames, correction UI
//

document.addEventListener("DOMContentLoaded", () => {
  const resetBtn = document.getElementById("reset-btn");

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (
        confirm(
          "⚠️ IMPORTANT: This will reset the user interface and delete all user data, meaning that you will have to run the inference again to obtain images, plots, etc. Are you sure you want to proceed?"
        )
      ) {

        // General backend reset
        fetch("/cleanup", { method: "DELETE" })
          .then((res) => res.json())
          .then((data) => {

            // Reset of inference progress in backend
            fetch("/reset_progress", { method: "POST" })
              .then(() => {
                console.log("Inference progress reset on backend");
              })
              .catch((err) =>
                console.error("Error resetting backend progress:", err)
              );

            // 3️⃣ Clean localstorage
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

            // Visual reset of progress bar
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
