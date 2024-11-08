const menu = {
  title: "Документация",
  items: [
    {
      title: "Энергоэффективность и Устойчивое Строительство",
      content: "Раскройте тему подробно и красиво оформите."
    },
    {
      title: "Типы Фундаментов: Ленточный, Плитный, Свайный",
      content: "Объясните разницу между...",
      items: [
        {
          title: "Ленточный Фундамент",
          content: "Поясните ленточный фундамент..."
        },
        {
          title: "Плитный Фундамент",
          content: "Опишите плитный фундамент..."
        },
        {
          title: "Свайный Фундамент",
          content: "Разъясните свайный фундамент..."
        }
      ]
    }
  ]
};

function stringOnLevel(item, level) {
  return `
    ${level === 0 ? `Категория: ${item.title}`: `  - ${item.title}`}
  `
}
const generateMenuString = (menu, level = 0) => {
  return menu.reduce((acc, item, index) => {
    return acc + '\n' + stringOnLevel(item, index) + (item.items ? generateMenuString(item.items, level + 1): '')
  }, '')
}

console.log(generateMenuString(menu.items))