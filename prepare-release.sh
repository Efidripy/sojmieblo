#!/bin/bash

# Скрипт для подготовки release архива sojmieblo
# Создает tar.gz архив со всеми необходимыми файлами

VERSION=${1:-"latest"}
RELEASE_NAME="sojmieblo-release"
TEMP_DIR="./release-temp"
ARCHIVE_NAME="${RELEASE_NAME}.tar.gz"

echo "Подготовка release архива версии: $VERSION"

# Создаем временную директорию
mkdir -p $TEMP_DIR/$RELEASE_NAME

# Копируем необходимые файлы
echo "Копирование файлов..."
cp -r public $TEMP_DIR/$RELEASE_NAME/
cp server.js $TEMP_DIR/$RELEASE_NAME/
cp package.json $TEMP_DIR/$RELEASE_NAME/
cp package-lock.json $TEMP_DIR/$RELEASE_NAME/ 2>/dev/null || echo "package-lock.json не найден, пропускаем"
cp README.md $TEMP_DIR/$RELEASE_NAME/
cp LICENSE $TEMP_DIR/$RELEASE_NAME/ 2>/dev/null || echo "LICENSE не найден, пропускаем"

# Создаем архив
echo "Создание архива $ARCHIVE_NAME..."
cd $TEMP_DIR
tar -czf ../$ARCHIVE_NAME $RELEASE_NAME
cd ..

# Удаляем временную директорию
rm -rf $TEMP_DIR

echo "✓ Release архив создан: $ARCHIVE_NAME"
echo "Размер: $(du -h $ARCHIVE_NAME | cut -f1)"
echo ""
echo "Архив содержит:"
tar -tzf $ARCHIVE_NAME | head -20
echo ""
echo "Для загрузки в GitHub Releases используйте этот файл."
