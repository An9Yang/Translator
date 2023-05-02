const API_KEY = "API";
const url = "https://api.openai.com/v1/completions";
let inputLanguage;
let loading;
let options = {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
};
let myButton, myInput, myOutput, languageSelect;
let myOutputText = "";

function setup() {
  noCanvas();
  myButton = select("#myButton");
  myButton.mousePressed(getText);
  inputLanguage = select("#inputLanguage");
  myInput = select("#myInput");

  myOutput = select("#myOutput");

  languageSelect = select("#languageSelect");
  myInput.elt.addEventListener("input", () => {
    myInput.elt.style.height = "auto";
    myInput.elt.style.height = myInput.elt.scrollHeight + "px";
  });
  loading = createP("Translating...");
  loading.hide();
  loading.parent("myOutput");
}

function getText() {
  const inputValue = myInput.value();
  const targetLanguage = languageSelect.value();

  console.log("myinput", inputValue);
  if (!inputValue || inputValue.length <= 0) {
    return;
  }

  options.body = JSON.stringify({
    model: "text-davinci-003",
    prompt: `Translate the following English text to ${targetLanguage}: ${inputValue}`,
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
  });

  /* Add these lines to show the loading indicator */
  loading.show();
  myOutput.html("");

  fetch(url, options)
    .then((response) => {
      console.log("response", response);
      const res = response.json();
      return res;
    })
    .then((response) => {
      if (response.choices && response.choices[0]) {
        myOutputText +=
          "<br/>Q:" + inputValue + "<br/>A:" + response.choices[0].text;
        myOutput.html(myOutputText);
        /* Add these lines to clear the input field and show the success message */
        myInput.value("");
        loading.hide();
      }
    })
    .catch((error) => {
      /* Add these lines to handle errors and hide the loading indicator */
      console.error("Error:", error);
      loading.hide();
      myOutput.html("An error occurred. Please try again.");
    });
}
