document.addEventListener("DOMContentLoaded", () => {
  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (confirm("⚠️ IMPORTANT: This will reset the user interface and delete all user data, meaning that you will have to run the inference again to obtain images, pltos, etc.. Are you sure you want to proceed?")) {
        fetch("/cleanup", { method: "DELETE" })
          .then(res => res.json())
          .then(data => {
            alert("User Interface has been reseted: " + data.message);
            location.reload();
          })
          .catch(err => alert("Error when reseting: " + err));
      }
    });
  }
});
