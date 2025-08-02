export function formatingPrice(priceInput) {
  if (!priceInput || isNaN(priceInput)) {
    throw new Error("Invalid or missing price");
  }

  const newPrice = priceInput.toString();

  let convertedValue = "";
  let finalValue = "";

  if (newPrice.length === 6) {
    const firstThree = newPrice.slice(0, 3);
    convertedValue = (parseInt(firstThree) / 100).toFixed(2);
    finalValue = `${convertedValue} Lakh`;

  } else if (newPrice.length === 7) {
    const firstFour = newPrice.slice(0, 4);
    convertedValue = (parseInt(firstFour) / 100).toFixed(2);
    finalValue = `${convertedValue} Lakh`;

  } else if (newPrice.length === 8) {
    const firstThree = newPrice.slice(0, 3);
    convertedValue = (parseInt(firstThree) / 100).toFixed(2);
    finalValue = `${convertedValue} Crore`;

  } else if (newPrice.length === 9) {
    const firstFour = newPrice.slice(0, 4);
    convertedValue = (parseInt(firstFour) / 100).toFixed(2);
    finalValue = `${convertedValue} Crore`;

  } else if (newPrice.length === 10) {
    const firstFive = newPrice.slice(0, 5);
    convertedValue = (parseInt(firstFive) / 100).toFixed(2);
    finalValue = `${convertedValue} Crore`;

  } else {
    throw new Error("Price must be between 6 to 10 digits");
  }

  return finalValue;
}